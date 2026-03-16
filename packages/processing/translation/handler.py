"""
Translation Lambda Function for SatyaMool

This Lambda function is triggered by DynamoDB Streams when documents reach
"ocr_complete" status. It detects the document language from OCR metadata,
invokes Amazon Translate for supported Indian languages, and stores the
translated text alongside the original in the Documents table.

Supported Languages: Hindi, Tamil, Kannada, Marathi, Telugu

Requirements: 5.1, 5.2, 5.3, 5.6, 5.7
"""

import json
import os
import boto3
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from decimal import Decimal
from botocore.exceptions import ClientError

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
DOCUMENTS_TABLE_NAME = os.environ.get('DOCUMENTS_TABLE_NAME', 'SatyaMool-Documents')

# AWS clients (lazy initialization)
_translate_client = None
_comprehend_client = None
_dynamodb = None
_documents_table = None


def get_translate_client():
    """Get or create Amazon Translate client"""
    global _translate_client
    if _translate_client is None:
        _translate_client = boto3.client('translate')
    return _translate_client


def get_comprehend_client():
    """Get or create Amazon Comprehend client for language detection"""
    global _comprehend_client
    if _comprehend_client is None:
        _comprehend_client = boto3.client('comprehend')
    return _comprehend_client


def get_dynamodb_resource():
    """Get or create DynamoDB resource"""
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource('dynamodb')
    return _dynamodb


def get_documents_table():
    """Get or create Documents table"""
    global _documents_table
    if _documents_table is None:
        dynamodb = get_dynamodb_resource()
        _documents_table = dynamodb.Table(DOCUMENTS_TABLE_NAME)
    return _documents_table

# Supported language mappings (ISO 639-1 codes for Amazon Translate)
# Requirements: 5.1
SUPPORTED_LANGUAGES = {
    'hi': 'Hindi',
    'ta': 'Tamil',
    'kn': 'Kannada',
    'mr': 'Marathi',
    'te': 'Telugu'
}

# Target language
TARGET_LANGUAGE = 'en'  # English

# Translation confidence threshold for flagging (Requirement 5.4)
TRANSLATION_CONFIDENCE_THRESHOLD = 80.0

# Heuristic thresholds for confidence detection
MIN_LENGTH_RATIO = 0.3  # Translated text should be at least 30% of original
MAX_LENGTH_RATIO = 3.0  # Translated text should not be more than 3x original
MIN_WORD_COUNT = 5  # Minimum words for meaningful translation
UNTRANSLATED_WORD_THRESHOLD = 0.3  # Max 30% untranslated words


def convert_floats_to_decimal(obj: Any) -> Any:
    """
    Recursively convert all float values to Decimal for DynamoDB compatibility.
    
    Args:
        obj: Object to convert (dict, list, float, or other)
        
    Returns:
        Object with floats converted to Decimal
    """
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: convert_floats_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    else:
        return obj


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main Lambda handler for translation processing.
    
    Triggered by DynamoDB Streams when documents reach "ocr_complete" status.
    Filters for documents that need translation and processes them.
    
    Requirements: 5.1, 5.2, 5.3
    
    Args:
        event: DynamoDB Stream event
        context: Lambda context
        
    Returns:
        Response with processing statistics
    """
    logger.info(f"Received DynamoDB Stream event with {len(event.get('Records', []))} records")
    
    processed_count = 0
    skipped_count = 0
    failed_count = 0
    
    for record in event.get('Records', []):
        try:
            # Only process INSERT and MODIFY events
            event_name = record.get('eventName')
            if event_name not in ['INSERT', 'MODIFY']:
                logger.debug(f"Skipping event type: {event_name}")
                skipped_count += 1
                continue
            
            # Get the new image (current state of the item)
            new_image = record.get('dynamodb', {}).get('NewImage', {})
            
            if not new_image:
                logger.warning("No NewImage in DynamoDB Stream record")
                skipped_count += 1
                continue
            
            # Extract document data
            document_data = deserialize_dynamodb_item(new_image)
            
            # Filter for documents with "ocr_complete" status (Requirement 5.2)
            processing_status = document_data.get('processingStatus')
            if processing_status != 'ocr_complete':
                logger.debug(f"Skipping document with status: {processing_status}")
                skipped_count += 1
                continue
            
            # Process the document
            process_translation(document_data)
            processed_count += 1
            
        except Exception as e:
            logger.error(f"Error processing record: {str(e)}", exc_info=True)
            failed_count += 1
            # Continue processing other records
    
    logger.info(
        f"Translation processing complete. "
        f"Processed: {processed_count}, Skipped: {skipped_count}, Failed: {failed_count}"
    )
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'processed': processed_count,
            'skipped': skipped_count,
            'failed': failed_count
        })
    }


def deserialize_dynamodb_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deserialize DynamoDB Stream item format to regular Python dict.
    
    Args:
        item: DynamoDB Stream item in wire format
        
    Returns:
        Deserialized Python dictionary
    """
    result = {}
    
    for key, value in item.items():
        if 'S' in value:
            result[key] = value['S']
        elif 'N' in value:
            result[key] = float(value['N'])
        elif 'BOOL' in value:
            result[key] = value['BOOL']
        elif 'M' in value:
            result[key] = deserialize_dynamodb_item(value['M'])
        elif 'L' in value:
            result[key] = [deserialize_dynamodb_item({'item': v})['item'] for v in value['L']]
        elif 'NULL' in value:
            result[key] = None
    
    return result


def process_translation(document_data: Dict[str, Any]) -> None:
    """
    Process translation for a single document.
    
    Detects language from OCR metadata, translates if needed, and stores results.
    Handles mixed-language documents by detecting and translating each section separately.
    
    Requirements: 5.1, 5.2, 5.3, 5.6, 5.7
    
    Args:
        document_data: Document data from DynamoDB
    """
    document_id = document_data.get('documentId')
    property_id = document_data.get('propertyId')
    
    logger.info(f"Processing translation for document {document_id}")
    
    # Update status to translation_processing
    update_document_status(document_id, property_id, 'translation_processing')
    
    try:
        # Get OCR text and metadata
        ocr_text = document_data.get('ocrText', '')
        ocr_metadata = document_data.get('ocrMetadata', {})
        
        if not ocr_text:
            logger.warning(f"No OCR text found for document {document_id}")
            update_document_status(document_id, property_id, 'translation_complete')
            return
        
        # Detect document language from OCR metadata (Requirement 5.2)
        detected_language = ocr_metadata.get('detected_language', 'en')
        
        logger.info(f"Primary detected language: {detected_language}")
        
        # Check if document contains mixed languages (Requirement 5.7)
        sections = detect_mixed_language_sections(ocr_text, detected_language)
        
        if len(sections) > 1:
            # Mixed-language document detected
            logger.info(f"Mixed-language document detected with {len(sections)} sections")
            translated_text, translation_metadata = translate_mixed_language_document(
                sections,
                TARGET_LANGUAGE
            )
        else:
            # Single language document
            section_language = sections[0]['language'] if sections else detected_language
            
            # Check if translation is needed
            if section_language == TARGET_LANGUAGE or section_language not in SUPPORTED_LANGUAGES:
                # No translation needed - either already in English or unsupported language
                logger.info(
                    f"No translation needed for document {document_id}. "
                    f"Language: {section_language}"
                )
                
                # Store original text as translated text (no translation performed)
                store_translation_results(
                    document_id,
                    property_id,
                    ocr_text,
                    ocr_text,  # Same as original
                    section_language,
                    TARGET_LANGUAGE,
                    translation_performed=False
                )
                
                update_document_status(document_id, property_id, 'translation_complete')
                return
            
            # Translate the entire document (Requirements 5.1, 5.3)
            translated_text, translation_metadata = translate_text(
                ocr_text,
                section_language,
                TARGET_LANGUAGE
            )
        
        # Store translation results (Requirement 5.6)
        store_translation_results(
            document_id,
            property_id,
            ocr_text,
            translated_text,
            detected_language,
            TARGET_LANGUAGE,
            translation_performed=True,
            translation_metadata=translation_metadata
        )
        
        # Update status to translation_complete (Requirement 5.7)
        update_document_status(document_id, property_id, 'translation_complete')
        
        logger.info(f"Successfully translated document {document_id}")
        
    except Exception as e:
        logger.error(f"Error translating document {document_id}: {str(e)}", exc_info=True)
        update_document_status(document_id, property_id, 'translation_failed', str(e))
        raise


def translate_text(
    text: str,
    source_language: str,
    target_language: str
) -> tuple[str, Dict[str, Any]]:
    """
    Translate text using Amazon Translate with optimized batching.
    
    Maintains context-aware translation for legal terminology.
    Implements request batching to reduce API calls and improve performance.
    
    Requirements: 5.1, 5.3, 5.5, 16.3, 16.4
    
    Args:
        text: Text to translate
        source_language: Source language code (ISO 639-1)
        target_language: Target language code (ISO 639-1)
        
    Returns:
        Tuple of (translated_text, translation_metadata)
    """
    logger.info(
        f"Translating text from {source_language} to {target_language}. "
        f"Text length: {len(text)} characters"
    )
    
    translate_client = get_translate_client()
    
    try:
        # Amazon Translate has a 10,000 byte limit per request
        # Optimize chunk size for better batching (Requirement 16.3, 16.4)
        MAX_CHUNK_SIZE = 9000  # Leave some buffer
        
        if len(text.encode('utf-8')) <= MAX_CHUNK_SIZE:
            # Single translation request
            response = translate_client.translate_text(
                Text=text,
                SourceLanguageCode=source_language,
                TargetLanguageCode=target_language,
                Settings={
                    'Formality': 'FORMAL',  # Use formal language for legal documents
                    'Profanity': 'MASK'  # Mask any profanity
                }
            )
            
            translated_text = response['TranslatedText']
            
            # Build metadata
            translation_metadata = {
                'source_language': source_language,
                'target_language': target_language,
                'source_language_name': SUPPORTED_LANGUAGES.get(source_language, source_language),
                'chunk_count': 1,
                'total_characters': len(text),
                'translated_characters': len(translated_text),
                'optimization': 'single_request'
            }
            
        else:
            # Split text into chunks and translate with batching optimization
            chunks = split_text_into_chunks(text, MAX_CHUNK_SIZE)
            
            logger.info(f"Splitting text into {len(chunks)} chunks for batched translation")
            
            # Batch translate chunks for better performance (Requirement 16.3, 16.4)
            translated_chunks = batch_translate_chunks(
                chunks,
                source_language,
                target_language,
                translate_client
            )
            
            # Combine translated chunks
            translated_text = ' '.join(translated_chunks)
            
            # Build metadata
            translation_metadata = {
                'source_language': source_language,
                'target_language': target_language,
                'source_language_name': SUPPORTED_LANGUAGES.get(source_language, source_language),
                'chunk_count': len(chunks),
                'total_characters': len(text),
                'translated_characters': len(translated_text),
                'optimization': 'batched_requests'
            }
        
        logger.info(
            f"Translation completed. "
            f"Original: {len(text)} chars, Translated: {len(translated_text)} chars"
        )
        
        return translated_text, translation_metadata
        
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        logger.error(f"Amazon Translate error: {error_code} - {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Translation error: {str(e)}", exc_info=True)
        raise


def batch_translate_chunks(
    chunks: List[str],
    source_language: str,
    target_language: str,
    translate_client
) -> List[str]:
    """
    Batch translate multiple text chunks with optimized API usage.
    
    Implements intelligent batching to reduce API calls and improve performance.
    Groups chunks together when possible to minimize round trips.
    
    Requirements: 16.3, 16.4 - Optimize AI service calls with request batching
    
    Args:
        chunks: List of text chunks to translate
        source_language: Source language code
        target_language: Target language code
        translate_client: Boto3 Translate client
        
    Returns:
        List of translated chunks in the same order
    """
    import concurrent.futures
    import time
    
    translated_chunks = []
    
    # Use ThreadPoolExecutor for parallel translation requests
    # Limit concurrency to avoid throttling (max 5 concurrent requests)
    MAX_WORKERS = 5
    
    logger.info(f"Batch translating {len(chunks)} chunks with {MAX_WORKERS} workers")
    
    def translate_single_chunk(chunk_data):
        """Translate a single chunk with retry logic"""
        chunk_index, chunk_text = chunk_data
        max_retries = 3
        retry_delay = 1.0
        
        for attempt in range(max_retries):
            try:
                response = translate_client.translate_text(
                    Text=chunk_text,
                    SourceLanguageCode=source_language,
                    TargetLanguageCode=target_language,
                    Settings={
                        'Formality': 'FORMAL',
                        'Profanity': 'MASK'
                    }
                )
                return (chunk_index, response['TranslatedText'])
            except ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                if error_code == 'ThrottlingException' and attempt < max_retries - 1:
                    # Exponential backoff for throttling
                    sleep_time = retry_delay * (2 ** attempt)
                    logger.warning(
                        f"Throttled on chunk {chunk_index}, retrying in {sleep_time}s"
                    )
                    time.sleep(sleep_time)
                else:
                    logger.error(f"Failed to translate chunk {chunk_index}: {error_code}")
                    raise
    
    # Create indexed chunks for parallel processing
    indexed_chunks = list(enumerate(chunks))
    
    # Use ThreadPoolExecutor for parallel translation
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        # Submit all translation tasks
        future_to_chunk = {
            executor.submit(translate_single_chunk, chunk_data): chunk_data[0]
            for chunk_data in indexed_chunks
        }
        
        # Collect results as they complete
        results = {}
        for future in concurrent.futures.as_completed(future_to_chunk):
            chunk_index = future_to_chunk[future]
            try:
                result_index, translated_text = future.result()
                results[result_index] = translated_text
                logger.debug(f"Completed translation of chunk {result_index + 1}/{len(chunks)}")
            except Exception as e:
                logger.error(f"Error translating chunk {chunk_index}: {str(e)}")
                raise
    
    # Reconstruct translated chunks in original order
    translated_chunks = [results[i] for i in range(len(chunks))]
    
    logger.info(f"Batch translation completed for {len(chunks)} chunks")
    
    return translated_chunks


def split_text_into_chunks(text: str, max_chunk_size: int) -> List[str]:
    """
    Split text into chunks that fit within Amazon Translate's size limit.
    
    Tries to split at sentence boundaries to maintain context.
    
    Args:
        text: Text to split
        max_chunk_size: Maximum chunk size in bytes
        
    Returns:
        List of text chunks
    """
    chunks = []
    current_chunk = ""
    
    # Split by sentences (simple approach - split on periods followed by space)
    sentences = text.replace('\n', ' ').split('. ')
    
    for i, sentence in enumerate(sentences):
        # Add period back only if it's not the last sentence
        if i < len(sentences) - 1:
            sentence = sentence.strip() + '. '
        else:
            sentence = sentence.strip()
        
        # Check if adding this sentence would exceed the limit
        potential_chunk = current_chunk + sentence
        if len(potential_chunk.encode('utf-8')) > max_chunk_size:
            # Save current chunk and start new one
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = sentence
        else:
            current_chunk += sentence
    
    # Add the last chunk
    if current_chunk:
        chunks.append(current_chunk.strip())
    
    return chunks


def detect_mixed_language_sections(text: str, fallback_language: str = 'en') -> List[Dict[str, Any]]:
    """
    Detect language per text section for mixed-language documents.
    
    Splits text into paragraphs and detects language for each section.
    Requirement 5.7: Detect language per text section
    
    Args:
        text: Full document text
        fallback_language: Fallback language if detection fails
        
    Returns:
        List of sections with detected language:
        [
            {'text': 'section text', 'language': 'hi', 'start': 0, 'end': 100},
            ...
        ]
    """
    logger.info("Detecting mixed-language sections")
    
    # Split text into paragraphs (sections separated by double newlines or single newlines)
    # We'll use paragraph boundaries as section boundaries
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    
    # If no double newlines, split by single newlines
    if len(paragraphs) == 1:
        paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
    
    # If still just one section, treat as single-language document
    if len(paragraphs) <= 1:
        logger.info("Single section document, no mixed-language detection needed")
        # Detect language for the entire text
        language = detect_text_language(text, fallback_language)
        return [{
            'text': text,
            'language': language,
            'start': 0,
            'end': len(text)
        }]
    
    logger.info(f"Found {len(paragraphs)} paragraphs for language detection")
    
    sections = []
    current_position = 0
    
    for paragraph in paragraphs:
        if not paragraph or len(paragraph) < 10:
            # Skip very short paragraphs (likely noise)
            current_position += len(paragraph) + 2  # +2 for newlines
            continue
        
        # Detect language for this paragraph
        language = detect_text_language(paragraph, fallback_language)
        
        sections.append({
            'text': paragraph,
            'language': language,
            'start': current_position,
            'end': current_position + len(paragraph)
        })
        
        current_position += len(paragraph) + 2  # +2 for paragraph separator
    
    # Merge consecutive sections with the same language
    merged_sections = merge_consecutive_same_language_sections(sections)
    
    logger.info(
        f"Detected {len(merged_sections)} language sections: "
        f"{[s['language'] for s in merged_sections]}"
    )
    
    return merged_sections


def detect_text_language(text: str, fallback_language: str = 'en') -> str:
    """
    Detect the dominant language of a text section using Amazon Comprehend.
    
    Args:
        text: Text to analyze
        fallback_language: Fallback language if detection fails
        
    Returns:
        ISO 639-1 language code (e.g., 'hi', 'en', 'ta')
    """
    # Limit text length for Comprehend (max 5000 bytes)
    if len(text.encode('utf-8')) > 5000:
        text = text[:1000]  # Use first 1000 characters for detection
    
    try:
        comprehend_client = get_comprehend_client()
        
        response = comprehend_client.detect_dominant_language(Text=text)
        
        # Get the most confident language
        languages = response.get('Languages', [])
        if languages:
            dominant_language = max(languages, key=lambda x: x['Score'])
            language_code = dominant_language['LanguageCode']
            confidence = dominant_language['Score']
            
            logger.debug(
                f"Detected language: {language_code} "
                f"(confidence: {confidence:.2%})"
            )
            
            return language_code
        else:
            logger.warning(f"No language detected, using fallback: {fallback_language}")
            return fallback_language
            
    except ClientError as e:
        logger.error(f"Comprehend language detection error: {str(e)}")
        # Fallback to provided language
        return fallback_language
    except Exception as e:
        logger.error(f"Language detection error: {str(e)}")
        return fallback_language


def merge_consecutive_same_language_sections(
    sections: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Merge consecutive sections that have the same language.
    
    This reduces the number of translation API calls and maintains context.
    
    Args:
        sections: List of language sections
        
    Returns:
        Merged list of sections
    """
    if not sections:
        return []
    
    merged = []
    current_section = sections[0].copy()
    
    for section in sections[1:]:
        if section['language'] == current_section['language']:
            # Merge with current section
            current_section['text'] += '\n\n' + section['text']
            current_section['end'] = section['end']
        else:
            # Different language, save current and start new
            merged.append(current_section)
            current_section = section.copy()
    
    # Add the last section
    merged.append(current_section)
    
    return merged


def translate_mixed_language_document(
    sections: List[Dict[str, Any]],
    target_language: str
) -> tuple[str, Dict[str, Any]]:
    """
    Translate a mixed-language document by translating each section separately.
    
    Requirement 5.7: Translate each section in its detected language
    
    Args:
        sections: List of language sections with detected languages
        target_language: Target language code (e.g., 'en')
        
    Returns:
        Tuple of (translated_text, translation_metadata)
    """
    logger.info(f"Translating mixed-language document with {len(sections)} sections")
    
    translated_sections = []
    section_metadata = []
    total_chars_original = 0
    total_chars_translated = 0
    
    for i, section in enumerate(sections):
        section_text = section['text']
        section_language = section['language']
        
        logger.info(
            f"Translating section {i+1}/{len(sections)}: "
            f"{section_language} -> {target_language} "
            f"({len(section_text)} chars)"
        )
        
        total_chars_original += len(section_text)
        
        # Check if translation is needed for this section
        if section_language == target_language:
            # Already in target language, no translation needed
            translated_text = section_text
            translation_performed = False
            logger.info(f"Section {i+1} already in {target_language}, skipping translation")
        elif section_language not in SUPPORTED_LANGUAGES:
            # Unsupported language, keep original
            translated_text = section_text
            translation_performed = False
            logger.warning(
                f"Section {i+1} language {section_language} not supported, "
                f"keeping original text"
            )
        else:
            # Translate this section
            translated_text, section_meta = translate_text(
                section_text,
                section_language,
                target_language
            )
            translation_performed = True
        
        translated_sections.append(translated_text)
        total_chars_translated += len(translated_text)
        
        # Store section metadata
        section_metadata.append({
            'section_index': i,
            'source_language': section_language,
            'target_language': target_language,
            'translation_performed': translation_performed,
            'original_length': len(section_text),
            'translated_length': len(translated_text)
        })
    
    # Combine translated sections, preserving section boundaries
    # Use double newlines to preserve paragraph structure
    combined_translated_text = '\n\n'.join(translated_sections)
    
    # Build metadata
    translation_metadata = {
        'mixed_language_document': True,
        'section_count': len(sections),
        'sections': section_metadata,
        'languages_detected': list(set(s['language'] for s in sections)),
        'total_characters_original': total_chars_original,
        'total_characters_translated': total_chars_translated
    }
    
    logger.info(
        f"Mixed-language translation complete. "
        f"Sections: {len(sections)}, "
        f"Languages: {translation_metadata['languages_detected']}"
    )
    
    return combined_translated_text, translation_metadata


def split_text_into_chunks(text: str, max_chunk_size: int) -> List[str]:
    """
    Split text into chunks that fit within Amazon Translate's size limit.
    
    Tries to split at sentence boundaries to maintain context.
    
    Args:
        text: Text to split
        max_chunk_size: Maximum chunk size in bytes
        
    Returns:
        List of text chunks
    """
    chunks = []
    current_chunk = ""
    
    # Split by sentences (simple approach - split on periods followed by space)
    sentences = text.replace('\n', ' ').split('. ')
    
    for i, sentence in enumerate(sentences):
        # Add period back only if it's not the last sentence
        if i < len(sentences) - 1:
            sentence = sentence.strip() + '. '
        else:
            sentence = sentence.strip()
        
        # Check if adding this sentence would exceed the limit
        potential_chunk = current_chunk + sentence
        if len(potential_chunk.encode('utf-8')) > max_chunk_size:
            # Save current chunk and start new one
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = sentence
        else:
            current_chunk += sentence
    
    # Add the last chunk
    if current_chunk:
        chunks.append(current_chunk.strip())
    
    return chunks


def calculate_translation_confidence(
    original_text: str,
    translated_text: str,
    source_language: str
) -> tuple[float, List[str]]:
    """
    Calculate translation confidence score using heuristics.
    
    Since Amazon Translate doesn't provide direct confidence scores,
    we use multiple heuristics to estimate translation quality:
    1. Length ratio check (translated text should be reasonable length)
    2. Word count check (minimum meaningful content)
    3. Untranslated word detection (words that remain in source language)
    4. Empty or very short translation detection
    
    Requirements: 5.4
    
    Args:
        original_text: Original text before translation
        translated_text: Translated text
        source_language: Source language code
        
    Returns:
        Tuple of (confidence_score, list_of_issues)
        confidence_score: 0-100 score
        list_of_issues: List of detected issues
    """
    issues = []
    confidence_score = 100.0
    
    # Check 1: Empty or very short translation
    if not translated_text or len(translated_text.strip()) < 10:
        issues.append("Translation is empty or too short")
        confidence_score -= 50.0
        return max(0.0, confidence_score), issues
    
    # Check 2: Length ratio check
    original_length = len(original_text)
    translated_length = len(translated_text)
    
    if original_length > 0:
        length_ratio = translated_length / original_length
        
        if length_ratio < MIN_LENGTH_RATIO:
            issues.append(
                f"Translated text is significantly shorter than original "
                f"({length_ratio:.1%} of original length)"
            )
            confidence_score -= 30.0
        elif length_ratio > MAX_LENGTH_RATIO:
            issues.append(
                f"Translated text is significantly longer than original "
                f"({length_ratio:.1%} of original length)"
            )
            confidence_score -= 20.0
    
    # Check 3: Word count check
    translated_words = translated_text.split()
    if len(translated_words) < MIN_WORD_COUNT:
        issues.append(
            f"Translation has very few words ({len(translated_words)} words)"
        )
        confidence_score -= 25.0
    
    # Check 4: Detect untranslated words (words that appear to be in source language)
    # This is a simple heuristic - check for common patterns in source language
    untranslated_ratio = detect_untranslated_content(
        translated_text,
        source_language
    )
    
    if untranslated_ratio > UNTRANSLATED_WORD_THRESHOLD:
        issues.append(
            f"High percentage of untranslated content detected "
            f"({untranslated_ratio:.1%})"
        )
        confidence_score -= 30.0
    
    # Check 5: Detect repeated patterns (might indicate translation failure)
    if has_excessive_repetition(translated_text):
        issues.append("Excessive repetition detected in translation")
        confidence_score -= 20.0
    
    # Ensure score is between 0 and 100
    confidence_score = max(0.0, min(100.0, confidence_score))
    
    return confidence_score, issues


def detect_untranslated_content(text: str, source_language: str) -> float:
    """
    Detect the ratio of untranslated content in the text.
    
    Uses Unicode ranges to detect characters from the source language script.
    
    Args:
        text: Text to analyze
        source_language: Source language code
        
    Returns:
        Ratio of untranslated characters (0.0 to 1.0)
    """
    if not text:
        return 0.0
    
    # Define Unicode ranges for different scripts
    script_ranges = {
        'hi': [(0x0900, 0x097F)],  # Devanagari (Hindi)
        'ta': [(0x0B80, 0x0BFF)],  # Tamil
        'kn': [(0x0C80, 0x0CFF)],  # Kannada
        'mr': [(0x0900, 0x097F)],  # Devanagari (Marathi)
        'te': [(0x0C00, 0x0C7F)]   # Telugu
    }
    
    ranges = script_ranges.get(source_language, [])
    if not ranges:
        return 0.0
    
    # Count characters in source language script
    source_script_chars = 0
    total_chars = 0
    
    for char in text:
        # Skip whitespace and punctuation
        if char.isspace() or not char.isalnum():
            continue
        
        total_chars += 1
        char_code = ord(char)
        
        # Check if character is in source language range
        for start, end in ranges:
            if start <= char_code <= end:
                source_script_chars += 1
                break
    
    if total_chars == 0:
        return 0.0
    
    return source_script_chars / total_chars


def has_excessive_repetition(text: str) -> bool:
    """
    Detect excessive repetition in text (might indicate translation failure).
    
    Args:
        text: Text to analyze
        
    Returns:
        True if excessive repetition detected
    """
    if not text or len(text) < 50:
        return False
    
    words = text.split()
    if len(words) < 10:
        return False
    
    # Check for repeated words
    word_counts = {}
    for word in words:
        word_lower = word.lower()
        word_counts[word_lower] = word_counts.get(word_lower, 0) + 1
    
    # If any word appears more than 30% of the time, it's excessive
    max_count = max(word_counts.values())
    if max_count > len(words) * 0.3:
        return True
    
    # Check for repeated phrases (3-word sequences)
    for i in range(len(words) - 5):
        phrase = ' '.join(words[i:i+3])
        remaining_text = ' '.join(words[i+3:])
        if phrase in remaining_text:
            # Same 3-word phrase appears again
            return True
    
    return False


def store_translation_results(
    document_id: str,
    property_id: str,
    original_text: str,
    translated_text: str,
    source_language: str,
    target_language: str,
    translation_performed: bool,
    translation_metadata: Optional[Dict[str, Any]] = None
) -> None:
    """
    Store translation results in DynamoDB Documents table.
    
    Preserves original language text alongside English translation.
    Calculates confidence scores and flags low-confidence translations.
    
    Requirements: 5.3, 5.4, 5.6
    
    Args:
        document_id: Document ID
        property_id: Property ID
        original_text: Original OCR text
        translated_text: Translated text
        source_language: Source language code
        target_language: Target language code
        translation_performed: Whether translation was actually performed
        translation_metadata: Optional translation metadata
    """
    logger.info(f"Storing translation results for document {document_id}")
    
    documents_table = get_documents_table()
    
    # Build translation metadata
    metadata = translation_metadata or {}
    metadata.update({
        'source_language': source_language,
        'target_language': target_language,
        'translation_performed': translation_performed,
        'translation_timestamp': datetime.utcnow().isoformat()
    })
    
    # Calculate translation confidence (Requirement 5.4)
    confidence_score = 100.0
    confidence_issues = []
    needs_manual_review = False
    
    if translation_performed:
        confidence_score, confidence_issues = calculate_translation_confidence(
            original_text,
            translated_text,
            source_language
        )
        
        # Flag for manual review if confidence is below threshold (Requirement 5.4)
        if confidence_score < TRANSLATION_CONFIDENCE_THRESHOLD:
            needs_manual_review = True
            logger.warning(
                f"Translation confidence below threshold for document {document_id}: "
                f"{confidence_score:.1f}% (threshold: {TRANSLATION_CONFIDENCE_THRESHOLD}%)"
            )
            logger.warning(f"Issues detected: {', '.join(confidence_issues)}")
    
    # Store confidence metadata (Requirement 5.4)
    metadata['confidence_score'] = confidence_score
    metadata['confidence_issues'] = confidence_issues
    metadata['needs_manual_review'] = needs_manual_review
    metadata['flagged_for_review'] = needs_manual_review
    
    # Add review metadata if flagged
    if needs_manual_review:
        metadata['review_metadata'] = {
            'flagged_at': datetime.utcnow().isoformat(),
            'reason': 'Low translation confidence',
            'confidence_score': confidence_score,
            'issues': confidence_issues,
            'review_status': 'pending'
        }
    
    # Prepare update expression
    update_expression = """
        SET translatedText = :translated_text,
            translationMetadata = :translation_metadata,
            translationConfidenceScore = :confidence_score,
            needsManualReview = :needs_review,
            updatedAt = :updated_at
    """
    
    # Convert ALL floats to Decimal before storing (DynamoDB doesn't support float)
    safe_metadata = convert_floats_to_decimal(metadata)
    expression_values = convert_floats_to_decimal({
        ':translated_text': translated_text,
        ':translation_metadata': safe_metadata,
        ':confidence_score': Decimal(str(confidence_score)),
        ':needs_review': needs_manual_review,
        ':updated_at': datetime.utcnow().isoformat()
    })
    
    # Update document in DynamoDB
    documents_table.update_item(
        Key={
            'documentId': document_id,
            'propertyId': property_id
        },
        UpdateExpression=update_expression,
        ExpressionAttributeValues=expression_values
    )
    
    logger.info(
        f"Translation results stored successfully for document {document_id}. "
        f"Confidence: {confidence_score:.1f}%, Manual review: {needs_manual_review}"
    )


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
    
    documents_table = get_documents_table()
    
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
