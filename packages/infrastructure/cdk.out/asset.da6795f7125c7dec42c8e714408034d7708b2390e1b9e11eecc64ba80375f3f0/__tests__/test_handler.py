"""
Unit tests for Analysis Lambda handler

Tests document type detection, extraction logic, and inconsistency detection.

Requirements: 6.2, 6.3, 6.4, 6.9
"""

import json
import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from handler import (
    lambda_handler,
    deserialize_dynamodb_item,
    detect_document_type,
    detect_inconsistencies,
    process_analysis
)


class TestLambdaHandler:
    """Test suite for lambda_handler function"""
    
    def test_lambda_handler_with_empty_records(self):
        """Test handler with empty records"""
        event = {'Records': []}
        context = Mock()
        
        result = lambda_handler(event, context)
        
        assert result['statusCode'] == 200
        body = json.loads(result['body'])
        assert body['processed'] == 0
        assert body['skipped'] == 0
        assert body['failed'] == 0
    
    def test_lambda_handler_skips_non_translation_complete(self):
        """Test handler skips documents not in translation_complete status"""
        event = {
            'Records': [
                {
                    'eventName': 'INSERT',
                    'dynamodb': {
                        'NewImage': {
                            'documentId': {'S': 'doc-123'},
                            'propertyId': {'S': 'prop-456'},
                            'processingStatus': {'S': 'ocr_complete'}
                        }
                    }
                }
            ]
        }
        context = Mock()
        
        result = lambda_handler(event, context)
        
        assert result['statusCode'] == 200
        body = json.loads(result['body'])
        assert body['skipped'] == 1
        assert body['processed'] == 0



class TestDeserializeDynamoDBItem:
    """Test suite for DynamoDB item deserialization"""
    
    def test_deserialize_string(self):
        """Test deserializing string values"""
        item = {'name': {'S': 'John Doe'}}
        result = deserialize_dynamodb_item(item)
        assert result == {'name': 'John Doe'}
    
    def test_deserialize_number(self):
        """Test deserializing number values"""
        item = {'age': {'N': '30'}}
        result = deserialize_dynamodb_item(item)
        assert result == {'age': 30.0}
    
    def test_deserialize_boolean(self):
        """Test deserializing boolean values"""
        item = {'active': {'BOOL': True}}
        result = deserialize_dynamodb_item(item)
        assert result == {'active': True}
    
    def test_deserialize_map(self):
        """Test deserializing map (nested object) values"""
        item = {
            'metadata': {
                'M': {
                    'key1': {'S': 'value1'},
                    'key2': {'N': '42'}
                }
            }
        }
        result = deserialize_dynamodb_item(item)
        assert result == {'metadata': {'key1': 'value1', 'key2': 42.0}}
    
    def test_deserialize_list(self):
        """Test deserializing list values"""
        item = {
            'tags': {
                'L': [
                    {'S': 'tag1'},
                    {'S': 'tag2'}
                ]
            }
        }
        result = deserialize_dynamodb_item(item)
        assert result == {'tags': ['tag1', 'tag2']}
    
    def test_deserialize_null(self):
        """Test deserializing null values"""
        item = {'optional': {'NULL': True}}
        result = deserialize_dynamodb_item(item)
        assert result == {'optional': None}


class TestDocumentTypeDetection:
    """Test suite for document type detection"""
    
    def test_detect_sale_deed(self):
        """Test detection of Sale Deed documents"""
        text = """
        SALE DEED
        This deed of conveyance is executed between the Vendor Mr. John Doe
        and the Vendee Mr. Jane Smith for a sale consideration of Rs. 50,00,000.
        """
        result = detect_document_type(text, {})
        assert result == 'sale_deed'
    
    def test_detect_mother_deed(self):
        """Test detection of Mother Deed documents"""
        text = """
        MOTHER DEED
        This is the original grant deed establishing the first recorded ownership
        of the property to Mr. Original Owner dated 1950-01-15.
        """
        result = detect_document_type(text, {})
        assert result == 'mother_deed'
    
    def test_detect_encumbrance_certificate(self):
        """Test detection of Encumbrance Certificate documents"""
        text = """
        ENCUMBRANCE CERTIFICATE
        This is to certify that the property bearing Survey Number 123/4
        has no encumbrance for the period from 2010-01-01 to 2023-12-31.
        Transaction history from Sub Registrar Office.
        """
        result = detect_document_type(text, {})
        assert result == 'encumbrance_certificate'
    
    def test_detect_unknown_defaults_to_sale_deed(self):
        """Test that unknown document types default to sale_deed"""
        text = "Some random property document text without clear indicators"
        result = detect_document_type(text, {})
        assert result == 'sale_deed'



class TestInconsistencyDetection:
    """Test suite for inconsistency detection"""
    
    @patch('handler.get_documents_table')
    def test_detect_survey_number_mismatch(self, mock_get_table):
        """Test detection of Survey Number mismatches"""
        # Mock DynamoDB table
        mock_table = Mock()
        mock_get_table.return_value = mock_table
        
        # Mock query response with another document
        mock_table.query.return_value = {
            'Items': [
                {
                    'documentId': 'doc-other',
                    'processingStatus': 'analysis_complete',
                    'extractedData': {
                        'survey_numbers': ['456/7', '456/8']
                    }
                }
            ]
        }
        
        # Current document data
        extracted_data = {
            'survey_numbers': ['123/4', '123/5']
        }
        
        inconsistencies = detect_inconsistencies(extracted_data, 'prop-123')
        
        # Should detect mismatch
        assert len(inconsistencies) > 0
        assert any(i['type'] == 'survey_number_mismatch' for i in inconsistencies)
        
        mismatch = next(i for i in inconsistencies if i['type'] == 'survey_number_mismatch')
        assert mismatch['severity'] == 'high'
        assert '123/4' in mismatch['current_values'] or '123/5' in mismatch['current_values']
    
    @patch('handler.get_documents_table')
    def test_no_inconsistency_with_matching_survey_numbers(self, mock_get_table):
        """Test no inconsistency when Survey Numbers match"""
        # Mock DynamoDB table
        mock_table = Mock()
        mock_get_table.return_value = mock_table
        
        # Mock query response with matching Survey Number
        mock_table.query.return_value = {
            'Items': [
                {
                    'documentId': 'doc-other',
                    'processingStatus': 'analysis_complete',
                    'extractedData': {
                        'survey_numbers': ['123/4', '456/7']
                    }
                }
            ]
        }
        
        # Current document data with overlapping Survey Number
        extracted_data = {
            'survey_numbers': ['123/4', '123/5']
        }
        
        inconsistencies = detect_inconsistencies(extracted_data, 'prop-123')
        
        # Should not detect mismatch (there's overlap)
        survey_mismatches = [i for i in inconsistencies if i['type'] == 'survey_number_mismatch']
        assert len(survey_mismatches) == 0
    
    def test_detect_date_inconsistency(self):
        """Test detection of date inconsistencies"""
        extracted_data = {
            'transaction_date': '2023-06-15',
            'registration_details': {
                'registration_date': '2023-06-10'  # Before transaction date
            },
            'survey_numbers': ['123/4']
        }
        
        with patch('handler.get_documents_table') as mock_get_table:
            mock_table = Mock()
            mock_get_table.return_value = mock_table
            mock_table.query.return_value = {'Items': []}
            
            inconsistencies = detect_inconsistencies(extracted_data, 'prop-123')
            
            # Should detect date inconsistency
            date_issues = [i for i in inconsistencies if i['type'] == 'date_inconsistency']
            assert len(date_issues) > 0
            assert date_issues[0]['severity'] == 'medium'



class TestBedrockExtraction:
    """Test suite for Bedrock extraction with mocked responses"""
    
    @patch('handler.get_bedrock_client')
    @patch('handler.get_documents_table')
    def test_sale_deed_extraction(self, mock_get_table, mock_get_bedrock):
        """Test Sale Deed extraction with mocked Bedrock response"""
        # Mock Bedrock client
        mock_bedrock = Mock()
        mock_get_bedrock.return_value = mock_bedrock
        
        # Mock Bedrock response
        mock_response = {
            'body': Mock()
        }
        mock_response['body'].read.return_value = json.dumps({
            'content': [
                {
                    'text': json.dumps({
                        'buyer_name': 'Jane Smith',
                        'seller_name': 'John Doe',
                        'transaction_date': '2023-06-15',
                        'sale_consideration': '5000000',
                        'survey_numbers': ['123/4', '123/5'],
                        'property_schedule': 'Land and building at...',
                        'boundaries': {
                            'north': 'Road',
                            'south': 'Plot 124',
                            'east': 'Plot 122',
                            'west': 'Canal'
                        },
                        'measurements': {
                            'area': '2400 sq ft',
                            'dimensions': '40ft x 60ft'
                        },
                        'family_relationships': ['son of Mr. Old Doe'],
                        'registration_details': {
                            'registration_number': 'REG-2023-456',
                            'registration_date': '2023-06-20',
                            'sub_registrar_office': 'Bangalore North'
                        }
                    })
                }
            ]
        }).encode('utf-8')
        
        mock_bedrock.invoke_model.return_value = mock_response
        
        # Mock DynamoDB table
        mock_table = Mock()
        mock_get_table.return_value = mock_table
        mock_table.query.return_value = {'Items': []}
        
        # Test extraction
        from handler import extract_sale_deed_data
        result = extract_sale_deed_data("Sample sale deed text", "doc-123")
        
        assert result['buyer_name'] == 'Jane Smith'
        assert result['seller_name'] == 'John Doe'
        assert result['transaction_date'] == '2023-06-15'
        assert '123/4' in result['survey_numbers']
        assert result['boundaries']['north'] == 'Road'
        assert result['measurements']['area'] == '2400 sq ft'
    
    @patch('handler.get_bedrock_client')
    @patch('handler.get_documents_table')
    def test_mother_deed_extraction(self, mock_get_table, mock_get_bedrock):
        """Test Mother Deed extraction with mocked Bedrock response"""
        # Mock Bedrock client
        mock_bedrock = Mock()
        mock_get_bedrock.return_value = mock_bedrock
        
        # Mock Bedrock response
        mock_response = {
            'body': Mock()
        }
        mock_response['body'].read.return_value = json.dumps({
            'content': [
                {
                    'text': json.dumps({
                        'original_owner_name': 'Mr. Original Owner',
                        'grant_date': '1950-01-15',
                        'survey_numbers': ['123/4'],
                        'property_schedule': 'Original grant of land...',
                        'grant_authority': 'Government of Karnataka',
                        'boundaries': {
                            'north': 'Government land',
                            'south': 'River',
                            'east': 'Forest',
                            'west': 'Village road'
                        },
                        'measurements': {
                            'area': '5 acres',
                            'dimensions': None
                        },
                        'registration_details': {
                            'registration_number': 'GRANT-1950-001',
                            'registration_date': '1950-01-20',
                            'sub_registrar_office': 'Bangalore'
                        }
                    })
                }
            ]
        }).encode('utf-8')
        
        mock_bedrock.invoke_model.return_value = mock_response
        
        # Mock DynamoDB table
        mock_table = Mock()
        mock_get_table.return_value = mock_table
        
        # Test extraction
        from handler import extract_mother_deed_data
        result = extract_mother_deed_data("Sample mother deed text", "doc-456")
        
        assert result['original_owner_name'] == 'Mr. Original Owner'
        assert result['grant_date'] == '1950-01-15'
        assert result['is_mother_deed'] == True
        assert '123/4' in result['survey_numbers']

    
    @patch('handler.get_bedrock_client')
    @patch('handler.get_documents_table')
    def test_encumbrance_certificate_extraction(self, mock_get_table, mock_get_bedrock):
        """Test Encumbrance Certificate extraction with mocked Bedrock response"""
        # Mock Bedrock client
        mock_bedrock = Mock()
        mock_get_bedrock.return_value = mock_bedrock
        
        # Mock Bedrock response
        mock_response = {
            'body': Mock()
        }
        mock_response['body'].read.return_value = json.dumps({
            'content': [
                {
                    'text': json.dumps({
                        'survey_numbers': ['123/4', '123/5'],
                        'certificate_period': {
                            'from_date': '2010-01-01',
                            'to_date': '2023-12-31'
                        },
                        'transactions': [
                            {
                                'transaction_date': '2015-06-15',
                                'document_number': 'DOC-2015-789',
                                'transaction_type': 'Sale',
                                'parties': {
                                    'from': 'John Doe',
                                    'to': 'Jane Smith'
                                },
                                'consideration': '3000000',
                                'remarks': None
                            },
                            {
                                'transaction_date': '2023-06-15',
                                'document_number': 'DOC-2023-456',
                                'transaction_type': 'Sale',
                                'parties': {
                                    'from': 'Jane Smith',
                                    'to': 'Bob Johnson'
                                },
                                'consideration': '5000000',
                                'remarks': None
                            }
                        ],
                        'sub_registrar_office': 'Bangalore North',
                        'issue_date': '2024-01-15',
                        'encumbrance_status': 'No Encumbrance'
                    })
                }
            ]
        }).encode('utf-8')
        
        mock_bedrock.invoke_model.return_value = mock_response
        
        # Mock DynamoDB table
        mock_table = Mock()
        mock_get_table.return_value = mock_table
        
        # Test extraction
        from handler import extract_encumbrance_certificate_data
        result = extract_encumbrance_certificate_data("Sample EC text", "doc-789")
        
        assert '123/4' in result['survey_numbers']
        assert result['certificate_period']['from_date'] == '2010-01-01'
        assert len(result['transactions']) == 2
        assert result['transactions'][0]['parties']['from'] == 'John Doe'
        assert result['transactions'][1]['consideration'] == '5000000'
        assert result['encumbrance_status'] == 'No Encumbrance'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
