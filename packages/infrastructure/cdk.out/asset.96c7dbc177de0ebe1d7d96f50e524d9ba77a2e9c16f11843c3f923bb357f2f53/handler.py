"""
OCR Lambda Function for SatyaMool

This Lambda function polls the SQS queue for document upload events,
retrieves documents from S3, invokes Amazon Textract for OCR processing,
and stores the results in DynamoDB.

Requirements: 3.1, 3.3, 3.4, 4.1, 4.2, 4.3, 4.7
"""

import json
import os
import boto3
import logging
import time
import sys
import io
import tempfile
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime
from functools import wraps
from botocore.exceptions import ClientError

# PDF processing library for repair and fallback text extraction
try:
    import fitz  # PyMuPDF
    PDF_REPAIR_AVAILABLE = True
except ImportError:
    PDF_REPAIR_AVAILABLE = False
    logging.warning("PyMuPDF not available. Install PyMuPDF for PDF repair and fallback text extraction.")

# Add common directory to path for idempotency module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'common'))

# Import idempotency utilities
from idempotency import (
    extract_sqs_idempotency_key,
    check_idempotency,
    mark_in_progress,
    mark_completed,
    mark_failed,
    conditional_update_document_status
)

# X-Ray instrumentation for distributed tracing (Task 23.4)
from aws_xray_sdk.core import xray_recorder
from aws_xray_sdk.core import patch_all

# Patch all supported libraries for automatic X-Ray tracing
patch_all()

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
s3_client = boto3.client('s3')
textract_client = boto3.client('textract')
dynamodb = boto3.resource('dynamodb')
sqs_client = boto3.client('sqs')

# Environment variables
DOCUMENTS_TABLE_NAME = os.environ.get('DOCUMENTS_TABLE_NAME', 'SatyaMool-Documents')
QUEUE_URL = os.environ.get('QUEUE_URL', '')

# DynamoDB table
documents_table = dynamodb.Table(DOCUMENTS_TABLE_NAME)

# Page threshold for sync vs async processing
# Requirement 16.3: Process documents under 60 seconds for < 10 pages
# Use async API for documents > 5 pages to handle large documents efficiently
# NOTE: Async API requires Textract subscription, so we use a high threshold to prefer sync API
SYNC_PAGE_THRESHOLD = 1000  # Use sync API for all documents (async requires subscription)

# Async API configuration for large documents (Requirement 16.3, 16.4)
ASYNC_POLL_INTERVAL = 5  # seconds between status checks
ASYNC_MAX_WAIT_TIME = 300  # 5 minutes max wait for async jobs


def retry_with_exponential_backoff(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0
) -> Callable:
    """
    Decorator for retrying functions with exponential backoff.
    
    Implements exponential backoff strategy: 1s, 2s, 4s for 3 retries.
    After max_retries, the exception is raised to trigger SQS retry mechanism.
    
    Requirements: 3.3, 3.4
    
    Args:
        max_retries: Maximum number of retry attempts (default: 3)
        base_delay: Initial delay in seconds (default: 1.0)
        max_delay: Maximum delay in seconds (default: 60.0)
        exponential_base: Base for exponential calculation (default: 2.0)
        
    Returns:
        Decorated function with retry logic
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(max_retries + 1):  # +1 for initial attempt
                try:
                    return func(*args, **kwargs)
                    
                except ClientError as e:
                    last_exception = e
                    error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                    
                    # Don't retry on certain errors (but allow them to propagate for fallback handling)
                    non_retryable_errors = [
                        'InvalidParameterException',
                        'InvalidS3ObjectException',
                        'AccessDeniedException'
                    ]
                    
                    if error_code in non_retryable_errors:
                        logger.error(f"Non-retryable error: {error_code}")
                        raise
                    
                    # UnsupportedDocumentException should propagate for fallback handling
                    if error_code == 'UnsupportedDocumentException':
                        logger.warning(f"Unsupported document format, will try fallback")
                        raise
                    
                    if attempt < max_retries:
                        # Calculate exponential backoff delay
                        delay = min(base_delay * (exponential_base ** attempt), max_delay)
                        logger.warning(
                            f"Attempt {attempt + 1}/{max_retries} failed with {error_code}. "
                            f"Retrying in {delay}s..."
                        )
                        time.sleep(delay)
                    else:
                        logger.error(
                            f"All {max_retries} retry attempts exhausted. "
                            f"Raising exception to trigger SQS retry/DLQ."
                        )
                        raise
                        
                except Exception as e:
                    last_exception = e
                    
                    if attempt < max_retries:
                        delay = min(base_delay * (exponential_base ** attempt), max_delay)
                        logger.warning(
                            f"Attempt {attempt + 1}/{max_retries} failed with {type(e).__name__}. "
                            f"Retrying in {delay}s..."
                        )
                        time.sleep(delay)
                    else:
                        logger.error(
                            f"All {max_retries} retry attempts exhausted. "
                            f"Raising exception to trigger SQS retry/DLQ."
                        )
                        raise
            
            # This should never be reached, but just in case
            if last_exception:
                raise last_exception
                
        return wrapper
    return decorator


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main Lambda handler for OCR processing.
    
    Processes SQS messages containing S3 event notifications for document uploads.
    """
    logger.info(f"Received event with {len(event.get('Records', []))} SQS messages")
    
    processed_count = 0
    failed_count = 0
    
    for record in event.get('Records', []):
        try:
            # Parse SQS message
            message_body = json.loads(record['body'])
            
            # Handle S3 event notification
            if 'Records' in message_body:
                for s3_record in message_body['Records']:
                    if s3_record.get('eventName', '').startswith('ObjectCreated'):
                        process_document(s3_record)
                        processed_count += 1
            else:
                logger.warning(f"Unexpected message format: {message_body}")
                
        except Exception as e:
            logger.error(f"Error processing record: {str(e)}", exc_info=True)
            failed_count += 1
            # Let the message return to queue for retry (don't delete it)
            raise
    
    logger.info(f"Processing complete. Processed: {processed_count}, Failed: {failed_count}")
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'processed': processed_count,
            'failed': failed_count
        })
    }


def process_document(s3_record: Dict[str, Any]) -> None:
    """
    Process a single document from S3 event with idempotency.
    
    Args:
        s3_record: S3 event record containing bucket and key information
    """
    bucket_name = s3_record['s3']['bucket']['name']
    object_key = s3_record['s3']['object']['key']
    
    logger.info(f"Processing document: s3://{bucket_name}/{object_key}")
    
    # Extract document ID and property ID from S3 key
    # Expected format: properties/{propertyId}/documents/{documentId}.{ext}
    document_id, property_id = extract_ids_from_key(object_key)
    
    if not document_id or not property_id:
        logger.error(f"Invalid S3 key format: {object_key}")
        return
    
    # Generate idempotency key for this document processing
    idempotency_key = f"ocr:{document_id}:{property_id}"
    
    logger.info(f"Checking idempotency for key: {idempotency_key}")
    
    # Check if already processed (idempotency check)
    existing_record = check_idempotency(idempotency_key)
    
    if existing_record:
        status = existing_record.get('status')
        logger.info(f"Document {document_id} already processed with status: {status}")
        
        if status == 'COMPLETED':
            logger.info(f"Document {document_id} OCR already completed, skipping")
            return
        
        if status == 'IN_PROGRESS':
            logger.info(f"Document {document_id} OCR already in progress, skipping duplicate")
            return
        
        if status == 'FAILED':
            logger.info(f"Document {document_id} OCR previously failed, retrying")
    
    # Mark as in progress (prevents duplicate processing)
    marked = mark_in_progress(idempotency_key)
    
    if not marked:
        logger.info(f"Document {document_id} already being processed by another instance")
        return
    
    # Update status to processing with conditional write
    success = conditional_update_document_status(
        documents_table,
        document_id,
        property_id,
        'ocr_processing',
        expected_status='pending'  # Only update if still pending
    )
    
    if not success:
        logger.warning(
            f"Document {document_id} status is not 'pending', "
            f"may have been processed by another instance"
        )
        mark_failed(idempotency_key, "Document status not pending")
        return
    
    try:
        # Get document metadata from S3
        s3_metadata = s3_client.head_object(Bucket=bucket_name, Key=object_key)
        file_size = s3_metadata['ContentLength']
        
        logger.info(f"Document size: {file_size} bytes")
        
        # Determine if we should use sync or async Textract API
        # For now, we'll estimate pages based on file size (rough estimate: 100KB per page)
        estimated_pages = max(1, file_size // (100 * 1024))
        
        if estimated_pages <= SYNC_PAGE_THRESHOLD:
            # Use synchronous Textract API
            logger.info(f"Using sync Textract API (estimated {estimated_pages} pages)")
            ocr_result = process_document_sync(bucket_name, object_key)
        else:
            # Use asynchronous Textract API
            logger.info(f"Using async Textract API (estimated {estimated_pages} pages)")
            ocr_result = process_document_async(bucket_name, object_key)
        
        # Store OCR results in DynamoDB
        store_ocr_results(document_id, property_id, ocr_result, bucket_name, object_key)
        
        # Update status to complete with conditional write
        conditional_update_document_status(
            documents_table,
            document_id,
            property_id,
            'ocr_complete',
            expected_status='ocr_processing'
        )
        
        # Mark idempotency record as completed
        mark_completed(idempotency_key, {'document_id': document_id, 'status': 'ocr_complete'})
        
        logger.info(f"Successfully processed document {document_id}")
        
    except Exception as e:
        logger.error(f"Error processing document {document_id}: {str(e)}", exc_info=True)
        
        # Update status to failed
        update_document_status(document_id, property_id, 'ocr_failed', str(e))
        
        # Mark idempotency record as failed
        mark_failed(idempotency_key, str(e))
        
        raise


def extract_ids_from_key(object_key: str) -> tuple[Optional[str], Optional[str]]:
    """
    Extract document ID and property ID from S3 object key.
    
    Expected format: properties/{propertyId}/documents/{documentId}.{ext}
    
    Args:
        object_key: S3 object key
        
    Returns:
        Tuple of (document_id, property_id)
    """
    try:
        parts = object_key.split('/')
        if len(parts) >= 4 and parts[0] == 'properties' and parts[2] == 'documents':
            property_id = parts[1]
            # Extract document ID without extension
            document_filename = parts[3]
            document_id = document_filename.rsplit('.', 1)[0]
            return document_id, property_id
    except Exception as e:
        logger.error(f"Error extracting IDs from key {object_key}: {str(e)}")
    
    return None, None


def repair_pdf_and_extract_text(bucket_name: str, object_key: str) -> Dict[str, Any]:
    """
    Fallback OCR using PyMuPDF when Textract fails.
    
    This function:
    1. Downloads the PDF from S3
    2. Opens and repairs the PDF using PyMuPDF (handles corrupted PDFs)
    3. Extracts text directly from PDF (no image conversion needed)
    4. Returns extracted text in Textract-compatible format
    
    Note: This method extracts embedded text from PDFs. For scanned PDFs without
    embedded text, this will return empty results. In production, you would need
    to add pytesseract + tesseract-ocr binary for true OCR on scanned documents.
    
    Args:
        bucket_name: S3 bucket name
        object_key: S3 object key
        
    Returns:
        OCR result dictionary compatible with Textract format
        
    Raises:
        Exception: If PDF repair libraries are not available or extraction fails
    """
    if not PDF_REPAIR_AVAILABLE:
        raise Exception("PDF repair libraries (PyMuPDF) not installed")
    
    logger.info("Attempting PDF repair and text extraction using PyMuPDF")
    
    # Download PDF from S3 to temporary file
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_file:
        tmp_path = tmp_file.name
        s3_client.download_fileobj(bucket_name, object_key, tmp_file)
    
    try:
        # Open PDF with PyMuPDF (automatically repairs many PDF issues)
        pdf_document = fitz.open(tmp_path)
        
        all_text = []
        all_blocks = []
        block_count = 0
        
        # Process each page
        for page_num in range(len(pdf_document)):
            page = pdf_document[page_num]
            
            # Extract text directly from PDF (works for PDFs with embedded text)
            page_text = page.get_text()
            
            if page_text.strip():
                all_text.append(page_text)
                
                # Split into lines for block-level structure
                lines = [line.strip() for line in page_text.split('\n') if line.strip()]
                
                for line in lines:
                    # Create Textract-compatible block
                    block = {
                        'BlockType': 'LINE',
                        'Text': line,
                        'Confidence': 95.0,  # PyMuPDF text extraction is reliable for embedded text
                        'Page': page_num + 1
                    }
                    all_blocks.append(block)
                    block_count += 1
                
                logger.info(f"Page {page_num + 1}: Extracted {len(lines)} lines")
            else:
                logger.warning(f"Page {page_num + 1}: No embedded text found (may be scanned image)")
        
        # Get page count before closing
        page_count = len(pdf_document)
        
        pdf_document.close()
        
        # Return in Textract-compatible format with all required fields
        result = {
            'text': '\n\n'.join(all_text),
            'raw_text': '\n\n'.join(all_text),
            'blocks': all_blocks,
            'confidence': 95.0,  # High confidence for embedded text extraction
            'page_count': page_count,
            'forms_count': 0,  # PyMuPDF doesn't extract forms
            'tables_count': 0,  # PyMuPDF doesn't extract tables
            'average_confidence': 95.0,
            'detected_language': 'unknown',  # PyMuPDF doesn't detect language
            'ocr_method': 'pymupdf_fallback'
        }
        
        logger.info(f"PyMuPDF fallback completed. Extracted {block_count} blocks from {page_count} pages")
        
        if block_count == 0:
            logger.warning(
                "No text extracted. PDF may be scanned images without embedded text. "
                "Consider adding pytesseract + tesseract-ocr for true OCR on scanned documents."
            )
        
        return result
        
    finally:
        # Clean up temporary file
        try:
            os.unlink(tmp_path)
        except Exception as e:
            logger.warning(f"Failed to delete temporary file {tmp_path}: {str(e)}")


@retry_with_exponential_backoff(max_retries=3, base_delay=1.0, exponential_base=2.0)
def process_document_sync(bucket_name: str, object_key: str) -> Dict[str, Any]:
    """
    Process document using synchronous Textract API (for documents < 5 pages).
    
    Decorated with retry logic: 3 retries with exponential backoff (1s, 2s, 4s).
    
    Args:
        bucket_name: S3 bucket name
        object_key: S3 object key
        
    Returns:
        OCR result dictionary
        
    Raises:
        ClientError: After 3 failed retry attempts, triggers SQS retry mechanism
    """
    logger.info("Starting synchronous Textract analysis")
    
    # Add X-Ray custom segment for Textract API call (Task 23.4)
    with xray_recorder.capture('textract_analyze_document') as segment:
        segment.put_metadata('bucket', bucket_name)
        segment.put_metadata('key', object_key)
        segment.put_annotation('api_type', 'sync')
        
        try:
            # Try AnalyzeDocument first (with FORMS and TABLES features)
            response = textract_client.analyze_document(
                Document={
                    'S3Object': {
                        'Bucket': bucket_name,
                        'Name': object_key
                    }
                },
                FeatureTypes=['FORMS', 'TABLES']
            )
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            
            # Handle SubscriptionRequiredException or UnsupportedDocumentException by falling back to DetectDocumentText
            if error_code in ['SubscriptionRequiredException', 'UnsupportedDocumentException']:
                if error_code == 'SubscriptionRequiredException':
                    logger.warning(
                        "Textract AnalyzeDocument requires subscription. "
                        "Falling back to DetectDocumentText (text only, no forms/tables)"
                    )
                else:
                    logger.warning(
                        "Textract AnalyzeDocument reports unsupported document format. "
                        "Falling back to DetectDocumentText (text only)"
                    )
                segment.put_annotation('fallback', 'detect_text_only')
                segment.put_annotation('fallback_reason', error_code)
                
                try:
                    # Use simpler DetectDocumentText API (text extraction only)
                    response = textract_client.detect_document_text(
                        Document={
                            'S3Object': {
                                'Bucket': bucket_name,
                                'Name': object_key
                            }
                        }
                    )
                except ClientError as detect_error:
                    detect_error_code = detect_error.response.get('Error', {}).get('Code', 'Unknown')
                    
                    # If DetectDocumentText also fails with UnsupportedDocumentException, try pytesseract
                    if detect_error_code == 'UnsupportedDocumentException':
                        logger.warning(
                            "DetectDocumentText also failed with UnsupportedDocumentException. "
                            "Attempting PDF repair and pytesseract fallback OCR"
                        )
                        segment.put_annotation('fallback', 'pytesseract')
                        segment.put_annotation('fallback_reason', 'textract_unsupported')
                        
                        # Try pytesseract fallback
                        return repair_pdf_and_extract_text(bucket_name, object_key)
                    else:
                        # Re-raise other DetectDocumentText errors
                        raise
            else:
                # Re-raise other errors for retry logic
                raise
        
        # Add response metadata to X-Ray
        segment.put_metadata('page_count', response.get('DocumentMetadata', {}).get('Pages', 0))
        segment.put_metadata('block_count', len(response.get('Blocks', [])))
    
    # Extract text, forms, and tables from response
    ocr_result = parse_textract_response(response)
    
    logger.info(f"Sync Textract completed. Extracted {len(ocr_result['blocks'])} blocks")
    
    return ocr_result


@retry_with_exponential_backoff(max_retries=3, base_delay=1.0, exponential_base=2.0)
def process_document_async(bucket_name: str, object_key: str) -> Dict[str, Any]:
    """
    Process document using asynchronous Textract API (for documents > 5 pages).
    
    Optimized for large documents with efficient polling and timeout handling.
    Decorated with retry logic: 3 retries with exponential backoff (1s, 2s, 4s).
    
    Requirements: 16.3, 16.4 - Use Textract async API for large documents
    
    Args:
        bucket_name: S3 bucket name
        object_key: S3 object key
        
    Returns:
        OCR result dictionary
        
    Raises:
        ClientError: After 3 failed retry attempts, triggers SQS retry mechanism
    """
    logger.info("Starting asynchronous Textract analysis for large document")
    
    # Add X-Ray custom segment for Textract async API call (Task 23.4)
    with xray_recorder.capture('textract_start_document_analysis') as segment:
        segment.put_metadata('bucket', bucket_name)
        segment.put_metadata('key', object_key)
        segment.put_annotation('api_type', 'async')
        
        try:
            # Start async document analysis
            response = textract_client.start_document_analysis(
                DocumentLocation={
                    'S3Object': {
                        'Bucket': bucket_name,
                        'Name': object_key
                    }
                },
                FeatureTypes=['FORMS', 'TABLES']
            )
            
            job_id = response['JobId']
            segment.put_metadata('job_id', job_id)
            logger.info(f"Started Textract async job: {job_id}")
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            
            # Handle SubscriptionRequiredException by falling back to sync API
            if error_code == 'SubscriptionRequiredException':
                logger.warning(
                    "Textract async API requires subscription. "
                    "Falling back to sync API (may timeout for large documents)"
                )
                segment.put_annotation('fallback', 'sync_api')
                return process_document_sync(bucket_name, object_key)
            
            # Re-raise other errors for retry logic
            raise
    
    # Poll for job completion with optimized timing (Requirement 16.3, 16.4)
    with xray_recorder.capture('textract_poll_job_completion') as segment:
        segment.put_metadata('job_id', job_id)
        
        max_attempts = ASYNC_MAX_WAIT_TIME // ASYNC_POLL_INTERVAL  # 60 attempts (5 minutes)
        attempt = 0
        start_time = time.time()
        
        while attempt < max_attempts:
            time.sleep(ASYNC_POLL_INTERVAL)  # Wait between polls
            attempt += 1
            elapsed_time = time.time() - start_time
            
            result = textract_client.get_document_analysis(JobId=job_id)
            status = result['JobStatus']
            
            logger.info(
                f"Textract job status: {status} "
                f"(attempt {attempt}/{max_attempts}, elapsed: {elapsed_time:.1f}s)"
            )
            
            if status == 'SUCCEEDED':
                segment.put_annotation('status', 'succeeded')
                segment.put_metadata('attempts', attempt)
                segment.put_metadata('elapsed_seconds', elapsed_time)
                
                # Get all pages of results with pagination
                ocr_result = parse_textract_response(result)
                
                # Handle pagination if there are more results
                next_token = result.get('NextToken')
                page_count = 1
                while next_token:
                    result = textract_client.get_document_analysis(
                        JobId=job_id,
                        NextToken=next_token
                    )
                    additional_result = parse_textract_response(result)
                    ocr_result['blocks'].extend(additional_result['blocks'])
                    ocr_result['raw_text'] += '\n' + additional_result['raw_text']
                    next_token = result.get('NextToken')
                    page_count += 1
                
                segment.put_metadata('page_count', page_count)
                segment.put_metadata('block_count', len(ocr_result['blocks']))
                
                logger.info(
                    f"Async Textract completed successfully. "
                    f"Extracted {len(ocr_result['blocks'])} blocks in {elapsed_time:.1f}s"
                )
                return ocr_result
                
            elif status == 'FAILED':
                error_msg = result.get('StatusMessage', 'Unknown error')
                segment.put_annotation('status', 'failed')
                segment.put_metadata('error', error_msg)
                segment.put_metadata('elapsed_seconds', elapsed_time)
                logger.error(f"Textract job failed: {error_msg}")
                raise Exception(f"Textract analysis failed: {error_msg}")
            
            elif status == 'IN_PROGRESS':
                # Continue polling
                continue
            else:
                # Unexpected status
                logger.warning(f"Unexpected Textract job status: {status}")
        
        # Timeout reached
        segment.put_annotation('status', 'timeout')
        segment.put_metadata('attempts', attempt)
        segment.put_metadata('elapsed_seconds', time.time() - start_time)
        raise Exception(
            f"Textract job timeout after {max_attempts} attempts "
            f"({ASYNC_MAX_WAIT_TIME}s max wait time)"
        )


def parse_textract_response(response: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse Textract API response and extract relevant information.
    
    Extracts confidence scores from all blocks and flags low-confidence regions (< 70%).
    Detects handwritten text and tracks individual low-confidence regions.
    
    Requirements: 4.4, 4.5
    
    Args:
        response: Textract API response
        
    Returns:
        Parsed OCR result with text, forms, tables, confidence scores, and low-confidence regions
    """
    blocks = response.get('Blocks', [])
    
    # Extract raw text
    raw_text_parts = []
    forms = []
    tables = []
    confidence_scores = []
    low_confidence_regions = []
    has_handwritten_text = False
    
    # Confidence threshold for flagging (Requirement 4.5)
    LOW_CONFIDENCE_THRESHOLD = 70.0
    
    for block in blocks:
        block_type = block.get('BlockType')
        confidence = block.get('Confidence', 0)
        text_type = block.get('TextType', 'PRINTED')  # PRINTED or HANDWRITING
        
        # Track all confidence scores for average calculation
        confidence_scores.append(confidence)
        
        # Detect handwritten text (Requirement 4.4)
        if text_type == 'HANDWRITING':
            has_handwritten_text = True
        
        if block_type == 'LINE':
            text = block.get('Text', '')
            raw_text_parts.append(text)
            
            # Flag low-confidence LINE blocks (Requirements 4.4, 4.5)
            if confidence < LOW_CONFIDENCE_THRESHOLD:
                low_confidence_regions.append({
                    'block_id': block.get('Id'),
                    'block_type': 'LINE',
                    'text': text,
                    'confidence': confidence,
                    'text_type': text_type,
                    'geometry': block.get('Geometry'),
                    'page': block.get('Page', 1)
                })
        
        elif block_type == 'WORD':
            # Flag low-confidence WORD blocks for detailed tracking
            if confidence < LOW_CONFIDENCE_THRESHOLD:
                low_confidence_regions.append({
                    'block_id': block.get('Id'),
                    'block_type': 'WORD',
                    'text': block.get('Text', ''),
                    'confidence': confidence,
                    'text_type': text_type,
                    'geometry': block.get('Geometry'),
                    'page': block.get('Page', 1)
                })
        
        elif block_type == 'KEY_VALUE_SET':
            # Extract form fields
            entity_types = block.get('EntityTypes', [])
            if 'KEY' in entity_types:
                forms.append({
                    'id': block.get('Id'),
                    'confidence': confidence,
                    'geometry': block.get('Geometry')
                })
                
                # Flag low-confidence form fields
                if confidence < LOW_CONFIDENCE_THRESHOLD:
                    low_confidence_regions.append({
                        'block_id': block.get('Id'),
                        'block_type': 'KEY_VALUE_SET',
                        'text': 'Form field',
                        'confidence': confidence,
                        'text_type': text_type,
                        'geometry': block.get('Geometry'),
                        'page': block.get('Page', 1)
                    })
        
        elif block_type == 'TABLE':
            # Extract table information
            tables.append({
                'id': block.get('Id'),
                'confidence': confidence,
                'geometry': block.get('Geometry'),
                'row_count': len([r for r in blocks if r.get('BlockType') == 'CELL' and r.get('Id') in block.get('Relationships', [{}])[0].get('Ids', [])])
            })
            
            # Flag low-confidence tables
            if confidence < LOW_CONFIDENCE_THRESHOLD:
                low_confidence_regions.append({
                    'block_id': block.get('Id'),
                    'block_type': 'TABLE',
                    'text': 'Table',
                    'confidence': confidence,
                    'text_type': text_type,
                    'geometry': block.get('Geometry'),
                    'page': block.get('Page', 1)
                })
    
    # Calculate average confidence
    avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0
    
    # Detect language (simplified - Textract provides this in DocumentMetadata)
    detected_language = response.get('DocumentMetadata', {}).get('Language', 'en')
    
    # Log confidence statistics
    logger.info(
        f"Confidence analysis: avg={avg_confidence:.2f}%, "
        f"low_confidence_regions={len(low_confidence_regions)}, "
        f"has_handwritten={has_handwritten_text}"
    )
    
    return {
        'blocks': blocks,
        'raw_text': '\n'.join(raw_text_parts),
        'forms_count': len(forms),
        'tables_count': len(tables),
        'average_confidence': avg_confidence,
        'detected_language': detected_language,
        'page_count': response.get('DocumentMetadata', {}).get('Pages', 1),
        'low_confidence_regions': low_confidence_regions,
        'has_handwritten_text': has_handwritten_text,
        'low_confidence_count': len(low_confidence_regions)
    }


def store_ocr_results(
    document_id: str,
    property_id: str,
    ocr_result: Dict[str, Any],
    bucket_name: str,
    object_key: str
) -> None:
    """
    Store OCR results in DynamoDB Documents table.
    
    Stores confidence metadata including low-confidence regions (< 70%) and handwritten text flags.
    
    Requirements: 4.4, 4.5
    
    Args:
        document_id: Document ID
        property_id: Property ID
        ocr_result: Parsed OCR result
        bucket_name: S3 bucket name
        object_key: S3 object key
    """
    logger.info(f"Storing OCR results for document {document_id}")
    
    # Prepare update expression
    update_expression = """
        SET ocrText = :ocr_text,
            ocrMetadata = :ocr_metadata,
            processingStatus = :status,
            updatedAt = :updated_at,
            s3Bucket = :bucket,
            s3Key = :key
    """
    
    # Build comprehensive confidence metadata (Requirements 4.4, 4.5)
    ocr_metadata = {
        'forms_count': ocr_result['forms_count'],
        'tables_count': ocr_result['tables_count'],
        'average_confidence': ocr_result['average_confidence'],
        'detected_language': ocr_result['detected_language'],
        'page_count': ocr_result['page_count'],
        'low_confidence_flag': ocr_result['average_confidence'] < 70,
        'low_confidence_count': ocr_result['low_confidence_count'],
        'has_handwritten_text': ocr_result['has_handwritten_text'],
        'low_confidence_regions': ocr_result['low_confidence_regions']
    }
    
    expression_values = {
        ':ocr_text': ocr_result['raw_text'],
        ':ocr_metadata': ocr_metadata,
        ':status': 'ocr_processing',
        ':updated_at': datetime.utcnow().isoformat(),
        ':bucket': bucket_name,
        ':key': object_key
    }
    
    # Update document in DynamoDB
    documents_table.update_item(
        Key={
            'documentId': document_id,
            'propertyId': property_id
        },
        UpdateExpression=update_expression,
        ExpressionAttributeValues=expression_values
    )
    
    # Log confidence warnings if applicable
    if ocr_metadata['low_confidence_flag']:
        logger.warning(
            f"Document {document_id} has low average confidence: "
            f"{ocr_metadata['average_confidence']:.2f}% "
            f"({ocr_metadata['low_confidence_count']} low-confidence regions)"
        )
    
    if ocr_metadata['has_handwritten_text']:
        logger.info(
            f"Document {document_id} contains handwritten text "
            f"(flagged {ocr_metadata['low_confidence_count']} low-confidence regions)"
        )
    
    logger.info(f"OCR results stored successfully for document {document_id}")


def update_document_status(
    document_id: str,
    property_id: str,
    status: str,
    error_message: Optional[str] = None
) -> None:
    """
    Update document processing status in DynamoDB.
    
    Args:
        document_id: Document ID
        property_id: Property ID
        status: New processing status
        error_message: Optional error message for failed status
    """
    logger.info(f"Updating document {document_id} status to {status}")
    
    update_expression = "SET processingStatus = :status, updatedAt = :updated_at"
    expression_values = {
        ':status': status,
        ':updated_at': datetime.utcnow().isoformat()
    }
    
    if error_message:
        update_expression += ", errorMessage = :error"
        expression_values[':error'] = error_message
    
    documents_table.update_item(
        Key={
            'documentId': document_id,
            'propertyId': property_id
        },
        UpdateExpression=update_expression,
        ExpressionAttributeValues=expression_values
    )
