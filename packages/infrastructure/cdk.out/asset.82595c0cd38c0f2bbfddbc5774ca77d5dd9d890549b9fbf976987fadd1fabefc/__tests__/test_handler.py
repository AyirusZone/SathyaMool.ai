"""
Unit tests for OCR Lambda handler

Tests Textract API integration, confidence scoring, and error handling.
Requirements: 4.1, 4.2, 4.5
"""

import unittest
from unittest.mock import Mock, patch, MagicMock
import json
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Mock boto3 before importing handler
with patch('boto3.client'), patch('boto3.resource'):
    import handler


class TestOCRHandler(unittest.TestCase):
    """Test cases for OCR Lambda handler"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.sample_s3_event = {
            'Records': [{
                'body': json.dumps({
                    'Records': [{
                        'eventName': 'ObjectCreated:Put',
                        's3': {
                            'bucket': {'name': 'test-bucket'},
                            'object': {'key': 'properties/prop-123/documents/doc-456.pdf'}
                        }
                    }]
                })
            }]
        }
        
        self.sample_textract_response = {
            'Blocks': [
                {
                    'BlockType': 'LINE',
                    'Text': 'Sample document text',
                    'Confidence': 95.5,
                    'Id': 'block-1'
                },
                {
                    'BlockType': 'LINE',
                    'Text': 'Second line of text',
                    'Confidence': 92.3,
                    'Id': 'block-2'
                },
                {
                    'BlockType': 'KEY_VALUE_SET',
                    'EntityTypes': ['KEY'],
                    'Confidence': 88.7,
                    'Id': 'block-3',
                    'Geometry': {}
                },
                {
                    'BlockType': 'TABLE',
                    'Confidence': 90.0,
                    'Id': 'block-4',
                    'Geometry': {}
                }
            ],
            'DocumentMetadata': {
                'Pages': 2,
                'Language': 'en'
            }
        }
    
    def test_extract_ids_from_key_valid(self):
        """Test extracting document and property IDs from valid S3 key"""
        key = 'properties/prop-123/documents/doc-456.pdf'
        doc_id, prop_id = handler.extract_ids_from_key(key)
        
        self.assertEqual(doc_id, 'doc-456')
        self.assertEqual(prop_id, 'prop-123')
    
    def test_extract_ids_from_key_invalid(self):
        """Test extracting IDs from invalid S3 key format"""
        key = 'invalid/path/format.pdf'
        doc_id, prop_id = handler.extract_ids_from_key(key)
        
        self.assertIsNone(doc_id)
        self.assertIsNone(prop_id)
    
    def test_parse_textract_response(self):
        """Test parsing Textract API response"""
        result = handler.parse_textract_response(self.sample_textract_response)
        
        # Verify extracted data
        self.assertEqual(len(result['blocks']), 4)
        self.assertIn('Sample document text', result['raw_text'])
        self.assertIn('Second line of text', result['raw_text'])
        self.assertEqual(result['forms_count'], 1)
        self.assertEqual(result['tables_count'], 1)
        self.assertEqual(result['page_count'], 2)
        self.assertEqual(result['detected_language'], 'en')
        
        # Verify confidence calculation
        expected_avg = (95.5 + 92.3 + 88.7 + 90.0) / 4
        self.assertAlmostEqual(result['average_confidence'], expected_avg, places=2)
    
    def test_parse_textract_response_low_confidence(self):
        """Test parsing Textract response with low confidence scores"""
        low_confidence_response = {
            'Blocks': [
                {
                    'BlockType': 'LINE',
                    'Text': 'Faded text',
                    'Confidence': 65.0,
                    'Id': 'block-1'
                },
                {
                    'BlockType': 'LINE',
                    'Text': 'More faded text',
                    'Confidence': 60.0,
                    'Id': 'block-2'
                }
            ],
            'DocumentMetadata': {
                'Pages': 1,
                'Language': 'en'
            }
        }
        
        result = handler.parse_textract_response(low_confidence_response)
        
        # Verify low confidence is detected
        self.assertLess(result['average_confidence'], 70)
    
    @patch('handler.textract_client')
    def test_process_document_sync(self, mock_textract):
        """Test synchronous Textract processing"""
        mock_textract.analyze_document.return_value = self.sample_textract_response
        
        result = handler.process_document_sync('test-bucket', 'test-key.pdf')
        
        # Verify Textract was called correctly
        mock_textract.analyze_document.assert_called_once()
        call_args = mock_textract.analyze_document.call_args
        self.assertEqual(call_args[1]['Document']['S3Object']['Bucket'], 'test-bucket')
        self.assertEqual(call_args[1]['Document']['S3Object']['Name'], 'test-key.pdf')
        self.assertIn('FORMS', call_args[1]['FeatureTypes'])
        self.assertIn('TABLES', call_args[1]['FeatureTypes'])
        
        # Verify result
        self.assertIn('blocks', result)
        self.assertIn('raw_text', result)
        self.assertGreater(result['average_confidence'], 0)
    
    @patch('handler.textract_client')
    @patch('handler.time.sleep')
    def test_process_document_async_success(self, mock_sleep, mock_textract):
        """Test asynchronous Textract processing with successful completion"""
        # Mock start_document_analysis
        mock_textract.start_document_analysis.return_value = {
            'JobId': 'test-job-123'
        }
        
        # Mock get_document_analysis - return SUCCEEDED on first call
        mock_textract.get_document_analysis.return_value = {
            'JobStatus': 'SUCCEEDED',
            'Blocks': self.sample_textract_response['Blocks'],
            'DocumentMetadata': self.sample_textract_response['DocumentMetadata']
        }
        
        result = handler.process_document_async('test-bucket', 'test-key.pdf')
        
        # Verify job was started
        mock_textract.start_document_analysis.assert_called_once()
        
        # Verify polling occurred
        mock_textract.get_document_analysis.assert_called()
        
        # Verify result
        self.assertIn('blocks', result)
        self.assertIn('raw_text', result)
    
    @patch('handler.textract_client')
    @patch('handler.time.sleep')
    def test_process_document_async_failure(self, mock_sleep, mock_textract):
        """Test asynchronous Textract processing with job failure"""
        # Mock start_document_analysis
        mock_textract.start_document_analysis.return_value = {
            'JobId': 'test-job-123'
        }
        
        # Mock get_document_analysis - return FAILED
        mock_textract.get_document_analysis.return_value = {
            'JobStatus': 'FAILED',
            'StatusMessage': 'Invalid document format'
        }
        
        # Verify exception is raised
        with self.assertRaises(Exception) as context:
            handler.process_document_async('test-bucket', 'test-key.pdf')
        
        self.assertIn('Textract analysis failed', str(context.exception))
    
    @patch('handler.documents_table')
    def test_update_document_status(self, mock_table):
        """Test updating document status in DynamoDB"""
        handler.update_document_status('doc-123', 'prop-456', 'ocr_complete')
        
        # Verify DynamoDB update was called
        mock_table.update_item.assert_called_once()
        call_args = mock_table.update_item.call_args
        
        # Verify key
        self.assertEqual(call_args[1]['Key']['documentId'], 'doc-123')
        self.assertEqual(call_args[1]['Key']['propertyId'], 'prop-456')
        
        # Verify status update
        self.assertIn('processingStatus', call_args[1]['UpdateExpression'])
        self.assertEqual(call_args[1]['ExpressionAttributeValues'][':status'], 'ocr_complete')
    
    @patch('handler.documents_table')
    def test_update_document_status_with_error(self, mock_table):
        """Test updating document status with error message"""
        error_msg = 'Textract API error'
        handler.update_document_status('doc-123', 'prop-456', 'ocr_failed', error_msg)
        
        # Verify error message is included
        call_args = mock_table.update_item.call_args
        self.assertIn('errorMessage', call_args[1]['UpdateExpression'])
        self.assertEqual(call_args[1]['ExpressionAttributeValues'][':error'], error_msg)
    
    @patch('handler.documents_table')
    def test_store_ocr_results(self, mock_table):
        """Test storing OCR results in DynamoDB"""
        ocr_result = {
            'raw_text': 'Sample text',
            'forms_count': 2,
            'tables_count': 1,
            'average_confidence': 85.5,
            'detected_language': 'en',
            'page_count': 3,
            'low_confidence_count': 0,
            'has_handwritten_text': False,
            'low_confidence_regions': []
        }
        
        handler.store_ocr_results(
            'doc-123',
            'prop-456',
            ocr_result,
            'test-bucket',
            'test-key.pdf'
        )
        
        # Verify DynamoDB update was called
        mock_table.update_item.assert_called_once()
        call_args = mock_table.update_item.call_args
        
        # Verify OCR data is stored
        values = call_args[1]['ExpressionAttributeValues']
        self.assertEqual(values[':ocr_text'], 'Sample text')
        self.assertEqual(values[':ocr_metadata']['forms_count'], 2)
        self.assertEqual(values[':ocr_metadata']['tables_count'], 1)
        self.assertEqual(values[':ocr_metadata']['average_confidence'], 85.5)
        self.assertFalse(values[':ocr_metadata']['low_confidence_flag'])
        self.assertEqual(values[':ocr_metadata']['low_confidence_count'], 0)
        self.assertFalse(values[':ocr_metadata']['has_handwritten_text'])
    
    @patch('handler.documents_table')
    def test_store_ocr_results_low_confidence(self, mock_table):
        """Test storing OCR results with low confidence flag"""
        ocr_result = {
            'raw_text': 'Faded text',
            'forms_count': 0,
            'tables_count': 0,
            'average_confidence': 65.0,
            'detected_language': 'en',
            'page_count': 1,
            'low_confidence_count': 5,
            'has_handwritten_text': False,
            'low_confidence_regions': [
                {
                    'block_id': 'block-1',
                    'block_type': 'LINE',
                    'text': 'Faded text',
                    'confidence': 65.0,
                    'text_type': 'PRINTED',
                    'geometry': {},
                    'page': 1
                }
            ]
        }
        
        handler.store_ocr_results(
            'doc-123',
            'prop-456',
            ocr_result,
            'test-bucket',
            'test-key.pdf'
        )
        
        # Verify low confidence flag is set
        call_args = mock_table.update_item.call_args
        values = call_args[1]['ExpressionAttributeValues']
        self.assertTrue(values[':ocr_metadata']['low_confidence_flag'])
        self.assertEqual(values[':ocr_metadata']['low_confidence_count'], 5)
        self.assertFalse(values[':ocr_metadata']['has_handwritten_text'])
        self.assertEqual(len(values[':ocr_metadata']['low_confidence_regions']), 1)
    
    def test_parse_textract_response_with_handwritten_text(self):
        """Test parsing Textract response with handwritten text (Requirement 4.4)"""
        handwritten_response = {
            'Blocks': [
                {
                    'BlockType': 'LINE',
                    'Text': 'Printed text',
                    'Confidence': 95.0,
                    'TextType': 'PRINTED',
                    'Id': 'block-1',
                    'Page': 1,
                    'Geometry': {}
                },
                {
                    'BlockType': 'LINE',
                    'Text': 'Handwritten signature',
                    'Confidence': 65.0,
                    'TextType': 'HANDWRITING',
                    'Id': 'block-2',
                    'Page': 1,
                    'Geometry': {}
                },
                {
                    'BlockType': 'WORD',
                    'Text': 'signature',
                    'Confidence': 60.0,
                    'TextType': 'HANDWRITING',
                    'Id': 'block-3',
                    'Page': 1,
                    'Geometry': {}
                }
            ],
            'DocumentMetadata': {
                'Pages': 1,
                'Language': 'en'
            }
        }
        
        result = handler.parse_textract_response(handwritten_response)
        
        # Verify handwritten text is detected
        self.assertTrue(result['has_handwritten_text'])
        
        # Verify low-confidence regions are flagged (< 70%)
        self.assertEqual(result['low_confidence_count'], 2)  # LINE and WORD with < 70% confidence
        self.assertEqual(len(result['low_confidence_regions']), 2)
        
        # Verify low-confidence region details
        low_conf_line = next(r for r in result['low_confidence_regions'] if r['block_type'] == 'LINE')
        self.assertEqual(low_conf_line['text'], 'Handwritten signature')
        self.assertEqual(low_conf_line['confidence'], 65.0)
        self.assertEqual(low_conf_line['text_type'], 'HANDWRITING')
        
        low_conf_word = next(r for r in result['low_confidence_regions'] if r['block_type'] == 'WORD')
        self.assertEqual(low_conf_word['text'], 'signature')
        self.assertEqual(low_conf_word['confidence'], 60.0)
        self.assertEqual(low_conf_word['text_type'], 'HANDWRITING')
    
    def test_parse_textract_response_faded_document(self):
        """Test parsing Textract response for severely faded document (Requirement 4.5)"""
        faded_response = {
            'Blocks': [
                {
                    'BlockType': 'LINE',
                    'Text': 'Barely visible text',
                    'Confidence': 55.0,
                    'TextType': 'PRINTED',
                    'Id': 'block-1',
                    'Page': 1,
                    'Geometry': {'BoundingBox': {'Left': 0.1, 'Top': 0.1}}
                },
                {
                    'BlockType': 'LINE',
                    'Text': 'More faded content',
                    'Confidence': 62.0,
                    'TextType': 'PRINTED',
                    'Id': 'block-2',
                    'Page': 1,
                    'Geometry': {'BoundingBox': {'Left': 0.1, 'Top': 0.2}}
                },
                {
                    'BlockType': 'WORD',
                    'Text': 'faded',
                    'Confidence': 58.0,
                    'TextType': 'PRINTED',
                    'Id': 'block-3',
                    'Page': 1,
                    'Geometry': {'BoundingBox': {'Left': 0.15, 'Top': 0.2}}
                },
                {
                    'BlockType': 'TABLE',
                    'Confidence': 68.0,
                    'TextType': 'PRINTED',
                    'Id': 'block-4',
                    'Page': 1,
                    'Geometry': {'BoundingBox': {'Left': 0.1, 'Top': 0.3}}
                },
                {
                    'BlockType': 'KEY_VALUE_SET',
                    'EntityTypes': ['KEY'],
                    'Confidence': 66.0,
                    'TextType': 'PRINTED',
                    'Id': 'block-5',
                    'Page': 1,
                    'Geometry': {'BoundingBox': {'Left': 0.1, 'Top': 0.4}}
                }
            ],
            'DocumentMetadata': {
                'Pages': 1,
                'Language': 'en'
            }
        }
        
        result = handler.parse_textract_response(faded_response)
        
        # Verify average confidence is below 70%
        self.assertLess(result['average_confidence'], 70.0)
        
        # Verify all low-confidence regions are flagged
        self.assertEqual(result['low_confidence_count'], 5)  # All blocks have < 70% confidence
        self.assertEqual(len(result['low_confidence_regions']), 5)
        
        # Verify different block types are captured
        block_types = {r['block_type'] for r in result['low_confidence_regions']}
        self.assertIn('LINE', block_types)
        self.assertIn('WORD', block_types)
        self.assertIn('TABLE', block_types)
        self.assertIn('KEY_VALUE_SET', block_types)
        
        # Verify geometry information is preserved
        for region in result['low_confidence_regions']:
            self.assertIn('geometry', region)
            self.assertIn('page', region)
            self.assertEqual(region['page'], 1)
    
    def test_parse_textract_response_mixed_confidence(self):
        """Test parsing Textract response with mixed confidence levels"""
        mixed_response = {
            'Blocks': [
                {
                    'BlockType': 'LINE',
                    'Text': 'Clear text',
                    'Confidence': 98.0,
                    'TextType': 'PRINTED',
                    'Id': 'block-1',
                    'Page': 1,
                    'Geometry': {}
                },
                {
                    'BlockType': 'LINE',
                    'Text': 'Unclear text',
                    'Confidence': 65.0,
                    'TextType': 'PRINTED',
                    'Id': 'block-2',
                    'Page': 1,
                    'Geometry': {}
                },
                {
                    'BlockType': 'LINE',
                    'Text': 'Another clear line',
                    'Confidence': 95.0,
                    'TextType': 'PRINTED',
                    'Id': 'block-3',
                    'Page': 1,
                    'Geometry': {}
                }
            ],
            'DocumentMetadata': {
                'Pages': 1,
                'Language': 'en'
            }
        }
        
        result = handler.parse_textract_response(mixed_response)
        
        # Verify average confidence is above 70% (due to high-confidence blocks)
        expected_avg = (98.0 + 65.0 + 95.0) / 3
        self.assertAlmostEqual(result['average_confidence'], expected_avg, places=2)
        self.assertGreater(result['average_confidence'], 70.0)
        
        # Verify only low-confidence regions are flagged
        self.assertEqual(result['low_confidence_count'], 1)
        self.assertEqual(len(result['low_confidence_regions']), 1)
        self.assertEqual(result['low_confidence_regions'][0]['text'], 'Unclear text')
        self.assertEqual(result['low_confidence_regions'][0]['confidence'], 65.0)
    
    @patch('handler.documents_table')
    def test_store_ocr_results_with_handwritten_text(self, mock_table):
        """Test storing OCR results with handwritten text flag (Requirement 4.4)"""
        ocr_result = {
            'raw_text': 'Mixed content',
            'forms_count': 1,
            'tables_count': 0,
            'average_confidence': 80.0,
            'detected_language': 'en',
            'page_count': 1,
            'low_confidence_count': 2,
            'has_handwritten_text': True,
            'low_confidence_regions': [
                {
                    'block_id': 'block-1',
                    'block_type': 'LINE',
                    'text': 'Handwritten note',
                    'confidence': 65.0,
                    'text_type': 'HANDWRITING',
                    'geometry': {},
                    'page': 1
                },
                {
                    'block_id': 'block-2',
                    'block_type': 'WORD',
                    'text': 'note',
                    'confidence': 62.0,
                    'text_type': 'HANDWRITING',
                    'geometry': {},
                    'page': 1
                }
            ]
        }
        
        handler.store_ocr_results(
            'doc-123',
            'prop-456',
            ocr_result,
            'test-bucket',
            'test-key.pdf'
        )
        
        # Verify handwritten text flag is stored
        call_args = mock_table.update_item.call_args
        values = call_args[1]['ExpressionAttributeValues']
        self.assertTrue(values[':ocr_metadata']['has_handwritten_text'])
        self.assertEqual(values[':ocr_metadata']['low_confidence_count'], 2)
        
        # Verify low-confidence regions are stored with details
        regions = values[':ocr_metadata']['low_confidence_regions']
        self.assertEqual(len(regions), 2)
        self.assertEqual(regions[0]['text_type'], 'HANDWRITING')
        self.assertEqual(regions[1]['text_type'], 'HANDWRITING')
    
    @patch('handler.textract_client')
    @patch('handler.time.sleep')
    def test_retry_logic_success_after_failure(self, mock_sleep, mock_textract):
        """Test retry logic succeeds after initial failures (Requirement 3.3)"""
        from botocore.exceptions import ClientError
        
        # Mock Textract to fail twice, then succeed
        mock_textract.analyze_document.side_effect = [
            ClientError(
                {'Error': {'Code': 'ThrottlingException', 'Message': 'Rate exceeded'}},
                'AnalyzeDocument'
            ),
            ClientError(
                {'Error': {'Code': 'ServiceUnavailableException', 'Message': 'Service unavailable'}},
                'AnalyzeDocument'
            ),
            self.sample_textract_response  # Success on third attempt
        ]
        
        result = handler.process_document_sync('test-bucket', 'test-key.pdf')
        
        # Verify retry occurred 3 times total (2 failures + 1 success)
        self.assertEqual(mock_textract.analyze_document.call_count, 3)
        
        # Verify exponential backoff delays (1s, 2s)
        self.assertEqual(mock_sleep.call_count, 2)
        mock_sleep.assert_any_call(1.0)  # First retry: 1s
        mock_sleep.assert_any_call(2.0)  # Second retry: 2s
        
        # Verify successful result
        self.assertIn('blocks', result)
        self.assertIn('raw_text', result)
    
    @patch('handler.textract_client')
    @patch('handler.time.sleep')
    def test_retry_logic_exhausted(self, mock_sleep, mock_textract):
        """Test retry logic exhausts after 3 attempts (Requirement 3.4)"""
        from botocore.exceptions import ClientError
        
        # Mock Textract to fail all attempts
        error = ClientError(
            {'Error': {'Code': 'ThrottlingException', 'Message': 'Rate exceeded'}},
            'AnalyzeDocument'
        )
        mock_textract.analyze_document.side_effect = [error, error, error, error]
        
        # Verify exception is raised after all retries
        with self.assertRaises(ClientError):
            handler.process_document_sync('test-bucket', 'test-key.pdf')
        
        # Verify 4 attempts total (1 initial + 3 retries)
        self.assertEqual(mock_textract.analyze_document.call_count, 4)
        
        # Verify exponential backoff delays (1s, 2s, 4s)
        self.assertEqual(mock_sleep.call_count, 3)
        mock_sleep.assert_any_call(1.0)  # First retry: 1s
        mock_sleep.assert_any_call(2.0)  # Second retry: 2s
        mock_sleep.assert_any_call(4.0)  # Third retry: 4s
    
    @patch('handler.textract_client')
    def test_retry_logic_non_retryable_error(self, mock_textract):
        """Test retry logic skips non-retryable errors"""
        from botocore.exceptions import ClientError
        
        # Mock Textract with non-retryable error
        error = ClientError(
            {'Error': {'Code': 'InvalidParameterException', 'Message': 'Invalid parameter'}},
            'AnalyzeDocument'
        )
        mock_textract.analyze_document.side_effect = error
        
        # Verify exception is raised immediately without retries
        with self.assertRaises(ClientError):
            handler.process_document_sync('test-bucket', 'test-key.pdf')
        
        # Verify only 1 attempt (no retries for non-retryable errors)
        self.assertEqual(mock_textract.analyze_document.call_count, 1)
    
    @patch('handler.textract_client')
    @patch('handler.time.sleep')
    def test_retry_logic_async_processing(self, mock_sleep, mock_textract):
        """Test retry logic works for async Textract processing"""
        from botocore.exceptions import ClientError
        
        # Mock start_document_analysis to fail twice, then succeed
        mock_textract.start_document_analysis.side_effect = [
            ClientError(
                {'Error': {'Code': 'ThrottlingException', 'Message': 'Rate exceeded'}},
                'StartDocumentAnalysis'
            ),
            ClientError(
                {'Error': {'Code': 'ServiceUnavailableException', 'Message': 'Service unavailable'}},
                'StartDocumentAnalysis'
            ),
            {'JobId': 'test-job-123'}  # Success on third attempt
        ]
        
        # Mock get_document_analysis for successful job completion
        mock_textract.get_document_analysis.return_value = {
            'JobStatus': 'SUCCEEDED',
            'Blocks': self.sample_textract_response['Blocks'],
            'DocumentMetadata': self.sample_textract_response['DocumentMetadata']
        }
        
        result = handler.process_document_async('test-bucket', 'test-key.pdf')
        
        # Verify retry occurred
        self.assertEqual(mock_textract.start_document_analysis.call_count, 3)
        
        # Verify successful result
        self.assertIn('blocks', result)
        self.assertIn('raw_text', result)


    @patch('handler.textract_client')
    @patch('handler.documents_table')
    @patch('handler.s3_client')
    def test_complete_integration_flow(self, mock_s3, mock_table, mock_textract):
        """Test complete integration flow from S3 event to DynamoDB storage (Requirements 4.1, 4.2, 4.5)"""
        # Mock S3 head_object
        mock_s3.head_object.return_value = {
            'ContentLength': 50000  # Small file for sync processing
        }
        
        # Mock Textract response
        mock_textract.analyze_document.return_value = self.sample_textract_response
        
        # Process the S3 event record
        s3_record = self.sample_s3_event['Records'][0]
        s3_event = json.loads(s3_record['body'])['Records'][0]
        
        handler.process_document(s3_event)
        
        # Verify S3 was queried
        mock_s3.head_object.assert_called_once()
        
        # Verify Textract was called with correct parameters
        mock_textract.analyze_document.assert_called_once()
        call_args = mock_textract.analyze_document.call_args
        self.assertIn('FORMS', call_args[1]['FeatureTypes'])
        self.assertIn('TABLES', call_args[1]['FeatureTypes'])
        
        # Verify DynamoDB was updated multiple times (status updates + OCR results)
        self.assertGreaterEqual(mock_table.update_item.call_count, 2)
        
        # Verify final status is ocr_complete
        final_call = mock_table.update_item.call_args_list[-1]
        final_values = final_call[1]['ExpressionAttributeValues']
        self.assertEqual(final_values[':status'], 'ocr_complete')


if __name__ == '__main__':
    unittest.main()
