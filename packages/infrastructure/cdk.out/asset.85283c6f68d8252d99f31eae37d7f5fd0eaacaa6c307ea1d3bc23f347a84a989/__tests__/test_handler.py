"""
Unit tests for Translation Lambda Handler

Tests language detection, translation logic, confidence flagging, mixed-language handling, and DynamoDB integration.
Requirements: 5.1, 5.2, 5.4, 5.7
"""

import json
import pytest
import os
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

# Set environment variables before importing handler
os.environ['AWS_DEFAULT_REGION'] = 'us-east-1'
os.environ['DOCUMENTS_TABLE_NAME'] = 'SatyaMool-Documents'

# Import the handler module
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from handler import (
    lambda_handler,
    deserialize_dynamodb_item,
    process_translation,
    translate_text,
    split_text_into_chunks,
    store_translation_results,
    update_document_status,
    calculate_translation_confidence,
    detect_mixed_language_sections,
    translate_mixed_language_document,
    detect_untranslated_content,
    has_excessive_repetition,
    SUPPORTED_LANGUAGES,
    TARGET_LANGUAGE
)


class TestLambdaHandler:
    """Test suite for lambda_handler function"""
    
    def test_lambda_handler_with_ocr_complete_status(self):
        """Test handler processes documents with ocr_complete status"""
        event = {
            'Records': [
                {
                    'eventName': 'MODIFY',
                    'dynamodb': {
                        'NewImage': {
                            'documentId': {'S': 'doc-123'},
                            'propertyId': {'S': 'prop-456'},
                            'processingStatus': {'S': 'ocr_complete'},
                            'ocrText': {'S': 'Sample text in Hindi'},
                            'ocrMetadata': {
                                'M': {
                                    'detected_language': {'S': 'hi'},
                                    'average_confidence': {'N': '85.5'}
                                }
                            }
                        }
                    }
                }
            ]
        }
        
        with patch('handler.process_translation') as mock_process:
            result = lambda_handler(event, None)
            
            assert result['statusCode'] == 200
            assert mock_process.call_count == 1
    
    def test_lambda_handler_skips_non_ocr_complete_status(self):
        """Test handler skips documents without ocr_complete status"""
        event = {
            'Records': [
                {
                    'eventName': 'MODIFY',
                    'dynamodb': {
                        'NewImage': {
                            'documentId': {'S': 'doc-123'},
                            'propertyId': {'S': 'prop-456'},
                            'processingStatus': {'S': 'ocr_processing'}
                        }
                    }
                }
            ]
        }
        
        with patch('handler.process_translation') as mock_process:
            result = lambda_handler(event, None)
            
            assert result['statusCode'] == 200
            assert mock_process.call_count == 0
    
    def test_lambda_handler_skips_delete_events(self):
        """Test handler skips DELETE events"""
        event = {
            'Records': [
                {
                    'eventName': 'REMOVE',
                    'dynamodb': {
                        'OldImage': {
                            'documentId': {'S': 'doc-123'}
                        }
                    }
                }
            ]
        }
        
        with patch('handler.process_translation') as mock_process:
            result = lambda_handler(event, None)
            
            assert result['statusCode'] == 200
            assert mock_process.call_count == 0
    
    def test_lambda_handler_handles_multiple_records(self):
        """Test handler processes multiple records"""
        event = {
            'Records': [
                {
                    'eventName': 'MODIFY',
                    'dynamodb': {
                        'NewImage': {
                            'documentId': {'S': 'doc-1'},
                            'propertyId': {'S': 'prop-1'},
                            'processingStatus': {'S': 'ocr_complete'},
                            'ocrText': {'S': 'Text 1'},
                            'ocrMetadata': {'M': {'detected_language': {'S': 'hi'}}}
                        }
                    }
                },
                {
                    'eventName': 'MODIFY',
                    'dynamodb': {
                        'NewImage': {
                            'documentId': {'S': 'doc-2'},
                            'propertyId': {'S': 'prop-2'},
                            'processingStatus': {'S': 'ocr_complete'},
                            'ocrText': {'S': 'Text 2'},
                            'ocrMetadata': {'M': {'detected_language': {'S': 'ta'}}}
                        }
                    }
                }
            ]
        }
        
        with patch('handler.process_translation') as mock_process:
            result = lambda_handler(event, None)
            
            assert result['statusCode'] == 200
            assert mock_process.call_count == 2


class TestDeserializeDynamoDBItem:
    """Test suite for deserialize_dynamodb_item function"""
    
    def test_deserialize_string(self):
        """Test deserialization of string values"""
        item = {'name': {'S': 'John Doe'}}
        result = deserialize_dynamodb_item(item)
        assert result == {'name': 'John Doe'}
    
    def test_deserialize_number(self):
        """Test deserialization of number values"""
        item = {'age': {'N': '30'}}
        result = deserialize_dynamodb_item(item)
        assert result == {'age': 30.0}
    
    def test_deserialize_boolean(self):
        """Test deserialization of boolean values"""
        item = {'active': {'BOOL': True}}
        result = deserialize_dynamodb_item(item)
        assert result == {'active': True}
    
    def test_deserialize_map(self):
        """Test deserialization of map (nested object) values"""
        item = {
            'metadata': {
                'M': {
                    'language': {'S': 'hi'},
                    'confidence': {'N': '85.5'}
                }
            }
        }
        result = deserialize_dynamodb_item(item)
        assert result == {
            'metadata': {
                'language': 'hi',
                'confidence': 85.5
            }
        }
    
    def test_deserialize_null(self):
        """Test deserialization of null values"""
        item = {'optional_field': {'NULL': True}}
        result = deserialize_dynamodb_item(item)
        assert result == {'optional_field': None}


class TestTranslateText:
    """Test suite for translate_text function"""
    
    @patch('handler.get_translate_client')
    def test_translate_text_single_chunk(self, mock_get_client):
        """Test translation of text that fits in single chunk"""
        mock_client = Mock()
        mock_client.translate_text.return_value = {
            'TranslatedText': 'This is translated text'
        }
        mock_get_client.return_value = mock_client
        
        text = 'यह हिंदी में पाठ है'
        translated, metadata = translate_text(text, 'hi', 'en')
        
        assert translated == 'This is translated text'
        assert metadata['source_language'] == 'hi'
        assert metadata['target_language'] == 'en'
        assert metadata['chunk_count'] == 1
        assert mock_client.translate_text.call_count == 1
    
    @patch('handler.get_translate_client')
    def test_translate_text_multiple_chunks(self, mock_get_client):
        """Test translation of text that requires chunking"""
        # Create a large text with sentences that exceeds MAX_CHUNK_SIZE
        sentences = ["This is sentence number {}.".format(i) for i in range(500)]
        large_text = " ".join(sentences)
        
        mock_client = Mock()
        mock_client.translate_text.return_value = {
            'TranslatedText': 'Translated chunk'
        }
        mock_get_client.return_value = mock_client
        
        translated, metadata = translate_text(large_text, 'hi', 'en')
        
        assert 'Translated chunk' in translated
        assert metadata['chunk_count'] > 1
        assert mock_client.translate_text.call_count > 1
    
    @patch('handler.get_translate_client')
    def test_translate_text_uses_formal_settings(self, mock_get_client):
        """Test that translation uses formal language settings"""
        mock_client = Mock()
        mock_client.translate_text.return_value = {
            'TranslatedText': 'Translated text'
        }
        mock_get_client.return_value = mock_client
        
        translate_text('Sample text', 'hi', 'en')
        
        call_args = mock_client.translate_text.call_args
        assert call_args[1]['Settings']['Formality'] == 'FORMAL'
        assert call_args[1]['Settings']['Profanity'] == 'MASK'


class TestSplitTextIntoChunks:
    """Test suite for split_text_into_chunks function"""
    
    def test_split_small_text(self):
        """Test that small text is not split"""
        text = "This is a small text."
        chunks = split_text_into_chunks(text, 1000)
        assert len(chunks) == 1
        assert chunks[0] == text
    
    def test_split_large_text(self):
        """Test that large text is split into multiple chunks"""
        # Create text with multiple sentences
        sentences = ["This is sentence {}.".format(i) for i in range(100)]
        text = " ".join(sentences)
        
        chunks = split_text_into_chunks(text, 500)
        
        assert len(chunks) > 1
        # Verify all chunks are within size limit
        for chunk in chunks:
            assert len(chunk.encode('utf-8')) <= 500
    
    def test_split_preserves_content(self):
        """Test that splitting preserves all content"""
        text = "First sentence. Second sentence. Third sentence."
        chunks = split_text_into_chunks(text, 30)
        
        # Combine chunks and verify content is preserved
        combined = " ".join(chunks)
        assert "First sentence" in combined
        assert "Second sentence" in combined
        assert "Third sentence" in combined


class TestSupportedLanguages:
    """Test suite for supported languages configuration"""
    
    def test_supported_languages_defined(self):
        """Test that supported languages are properly defined"""
        assert 'hi' in SUPPORTED_LANGUAGES  # Hindi
        assert 'ta' in SUPPORTED_LANGUAGES  # Tamil
        assert 'kn' in SUPPORTED_LANGUAGES  # Kannada
        assert 'mr' in SUPPORTED_LANGUAGES  # Marathi
        assert 'te' in SUPPORTED_LANGUAGES  # Telugu
    
    def test_target_language_is_english(self):
        """Test that target language is English"""
        assert TARGET_LANGUAGE == 'en'




class TestConfidenceFlagging:
    """Test suite for translation confidence flagging (Requirement 5.4)"""
    
    @patch('handler.get_documents_table')
    def test_flags_low_confidence_when_translated_text_too_short(self, mock_get_table):
        """Test that low confidence is flagged when translated text is significantly shorter"""
        mock_table = Mock()
        mock_get_table.return_value = mock_table
        
        # Original text is 100 chars, translated is only 20 chars (20% of original)
        original_text = "A" * 100
        translated_text = "B" * 20
        
        store_translation_results(
            document_id='doc-123',
            property_id='prop-456',
            original_text=original_text,
            translated_text=translated_text,
            source_language='hi',
            target_language='en',
            translation_performed=True
        )
        
        call_args = mock_table.update_item.call_args
        metadata = call_args[1]['ExpressionAttributeValues'][':translation_metadata']
        
        # Should flag for manual review
        assert metadata['needs_manual_review'] is True
        assert metadata['confidence_score'] < 80.0
    
    @patch('handler.get_documents_table')
    def test_no_flag_when_translated_text_reasonable_length(self, mock_get_table):
        """Test that confidence is not flagged when translated text length is reasonable"""
        mock_table = Mock()
        mock_get_table.return_value = mock_table
        
        # Use meaningful text with enough words
        original_text = "This is a sample legal document with sufficient content to analyze properly and determine ownership rights."
        translated_text = "This is a translated legal document with adequate content for analysis and ownership determination."
        
        store_translation_results(
            document_id='doc-123',
            property_id='prop-456',
            original_text=original_text,
            translated_text=translated_text,
            source_language='hi',
            target_language='en',
            translation_performed=True
        )
        
        call_args = mock_table.update_item.call_args
        metadata = call_args[1]['ExpressionAttributeValues'][':translation_metadata']
        
        # Should not flag for manual review
        assert metadata['needs_manual_review'] is False
        assert metadata['confidence_score'] >= 80.0
    
    @patch('handler.get_documents_table')
    def test_no_flag_when_no_translation_performed(self, mock_get_table):
        """Test that confidence is not flagged when no translation was performed"""
        mock_table = Mock()
        mock_get_table.return_value = mock_table
        
        # Same text for original and translated (English document)
        text = "This is English text that does not need translation"
        
        store_translation_results(
            document_id='doc-123',
            property_id='prop-456',
            original_text=text,
            translated_text=text,
            source_language='en',
            target_language='en',
            translation_performed=False
        )
        
        call_args = mock_table.update_item.call_args
        metadata = call_args[1]['ExpressionAttributeValues'][':translation_metadata']
        
        # Should not flag for manual review when no translation performed
        assert metadata['needs_manual_review'] is False
        assert metadata['confidence_score'] == 100.0
    
    @patch('handler.get_documents_table')
    def test_confidence_metadata_includes_timestamp(self, mock_get_table):
        """Test that translation metadata includes timestamp"""
        mock_table = Mock()
        mock_get_table.return_value = mock_table
        
        store_translation_results(
            document_id='doc-123',
            property_id='prop-456',
            original_text='Original text with sufficient length',
            translated_text='Translated text with adequate length',
            source_language='hi',
            target_language='en',
            translation_performed=True
        )
        
        call_args = mock_table.update_item.call_args
        metadata = call_args[1]['ExpressionAttributeValues'][':translation_metadata']
        
        # Should include timestamp
        assert 'translation_timestamp' in metadata
        assert metadata['translation_timestamp'] is not None
    
    @patch('handler.get_documents_table')
    def test_stores_confidence_score_in_document(self, mock_get_table):
        """Test that confidence score is stored in document"""
        mock_table = Mock()
        mock_get_table.return_value = mock_table
        
        store_translation_results(
            document_id='doc-123',
            property_id='prop-456',
            original_text='Original text with sufficient length for testing',
            translated_text='Translated text with adequate length for testing',
            source_language='hi',
            target_language='en',
            translation_performed=True
        )
        
        call_args = mock_table.update_item.call_args
        values = call_args[1]['ExpressionAttributeValues']
        
        # Should store confidence score
        assert ':confidence_score' in values
        assert isinstance(values[':confidence_score'], float)
        assert 0 <= values[':confidence_score'] <= 100
    
    def test_calculate_confidence_detects_short_translation(self):
        """Test that confidence calculation detects very short translations"""
        original = "A" * 100
        translated = "B" * 10  # Only 10% of original
        
        confidence, issues = calculate_translation_confidence(original, translated, 'hi')
        
        assert confidence < 80.0
        assert len(issues) > 0
        assert any('shorter' in issue.lower() for issue in issues)
    
    def test_calculate_confidence_detects_few_words(self):
        """Test that confidence calculation detects translations with few words"""
        original = "This is a long original text with many words"
        translated = "Short"  # Only 1 word
        
        confidence, issues = calculate_translation_confidence(original, translated, 'hi')
        
        assert confidence < 80.0
        # Should have at least one issue detected
        assert len(issues) > 0


class TestMixedLanguageHandling:
    """Test suite for mixed-language document handling (Requirement 5.7)"""
    
    @patch('handler.update_document_status')
    @patch('handler.store_translation_results')
    @patch('handler.detect_mixed_language_sections')
    @patch('handler.translate_text')
    def test_handles_document_with_single_language(
        self, mock_translate, mock_detect, mock_store, mock_update
    ):
        """Test handling of document with single language"""
        document_data = {
            'documentId': 'doc-123',
            'propertyId': 'prop-456',
            'ocrText': 'यह हिंदी में पाठ है',
            'ocrMetadata': {
                'detected_language': 'hi',
                'average_confidence': 85.5
            }
        }
        
        # Mock single language section
        mock_detect.return_value = [{
            'text': 'यह हिंदी में पाठ है',
            'language': 'hi',
            'start': 0,
            'end': 100
        }]
        
        mock_translate.return_value = (
            'This is text in Hindi',
            {'source_language': 'hi', 'target_language': 'en'}
        )
        
        process_translation(document_data)
        
        # Should translate the entire document as one unit
        assert mock_translate.call_count == 1
        assert mock_store.call_count == 1
    
    @patch('handler.update_document_status')
    @patch('handler.store_translation_results')
    @patch('handler.detect_mixed_language_sections')
    @patch('handler.translate_mixed_language_document')
    def test_handles_document_with_mixed_languages(
        self, mock_translate_mixed, mock_detect, mock_store, mock_update
    ):
        """Test that mixed-language documents are handled properly"""
        document_data = {
            'documentId': 'doc-123',
            'propertyId': 'prop-456',
            'ocrText': 'यह हिंदी है. This is English. यह फिर से हिंदी है.',
            'ocrMetadata': {
                'detected_language': 'hi',
                'average_confidence': 85.5
            }
        }
        
        # Mock multiple language sections
        mock_detect.return_value = [
            {'text': 'यह हिंदी है', 'language': 'hi', 'start': 0, 'end': 50},
            {'text': 'This is English', 'language': 'en', 'start': 51, 'end': 100},
            {'text': 'यह फिर से हिंदी है', 'language': 'hi', 'start': 101, 'end': 150}
        ]
        
        mock_translate_mixed.return_value = (
            'This is Hindi. This is English. This is Hindi again.',
            {
                'mixed_language_document': True,
                'section_count': 3,
                'languages_detected': ['hi', 'en']
            }
        )
        
        process_translation(document_data)
        
        # Should use mixed-language translation
        assert mock_translate_mixed.call_count == 1
        assert mock_store.call_count == 1
    
    @patch('handler.update_document_status')
    @patch('handler.store_translation_results')
    @patch('handler.detect_mixed_language_sections')
    @patch('handler.translate_text')
    def test_preserves_original_text_for_mixed_language_document(
        self, mock_translate, mock_detect, mock_store, mock_update
    ):
        """Test that original text is preserved alongside translation"""
        original_text = 'यह हिंदी है. This is English.'
        
        document_data = {
            'documentId': 'doc-123',
            'propertyId': 'prop-456',
            'ocrText': original_text,
            'ocrMetadata': {
                'detected_language': 'hi'
            }
        }
        
        # Mock single section (will use regular translation)
        mock_detect.return_value = [{
            'text': original_text,
            'language': 'hi',
            'start': 0,
            'end': len(original_text)
        }]
        
        mock_translate.return_value = (
            'This is Hindi. This is English.',
            {'source_language': 'hi', 'target_language': 'en'}
        )
        
        process_translation(document_data)
        
        # Verify original text is passed to store function
        store_call_args = mock_store.call_args
        assert store_call_args[0][2] == original_text  # original_text argument
    
    @patch('handler.translate_text')
    def test_translate_mixed_language_document_with_multiple_sections(self, mock_translate):
        """Test translation of document with multiple language sections"""
        sections = [
            {'text': 'Hindi text', 'language': 'hi', 'start': 0, 'end': 50},
            {'text': 'English text', 'language': 'en', 'start': 51, 'end': 100},
            {'text': 'Tamil text', 'language': 'ta', 'start': 101, 'end': 150}
        ]
        
        mock_translate.return_value = ('Translated text', {})
        
        translated, metadata = translate_mixed_language_document(sections, 'en')
        
        # Should translate non-English sections
        assert mock_translate.call_count == 2  # Hindi and Tamil, not English
        assert metadata['mixed_language_document'] is True
        assert metadata['section_count'] == 3
        assert 'hi' in metadata['languages_detected']
        assert 'en' in metadata['languages_detected']
        assert 'ta' in metadata['languages_detected']


class TestLanguageDetectionLogic:
    """Test suite for language detection logic (Requirement 5.1, 5.2)"""
    
    @patch('handler.update_document_status')
    @patch('handler.store_translation_results')
    @patch('handler.detect_mixed_language_sections')
    @patch('handler.translate_text')
    def test_detects_hindi_language(self, mock_translate, mock_detect, mock_store, mock_update):
        """Test detection of Hindi language"""
        document_data = {
            'documentId': 'doc-123',
            'propertyId': 'prop-456',
            'ocrText': 'Sample Hindi text',
            'ocrMetadata': {
                'detected_language': 'hi'
            }
        }
        
        mock_detect.return_value = [{
            'text': 'Sample Hindi text',
            'language': 'hi',
            'start': 0,
            'end': 100
        }]
        
        mock_translate.return_value = ('Translated', {})
        
        process_translation(document_data)
        
        # Should call translate with Hindi as source
        translate_call_args = mock_translate.call_args
        assert translate_call_args[0][1] == 'hi'
    
    @patch('handler.update_document_status')
    @patch('handler.store_translation_results')
    @patch('handler.detect_mixed_language_sections')
    @patch('handler.translate_text')
    def test_detects_tamil_language(self, mock_translate, mock_detect, mock_store, mock_update):
        """Test detection of Tamil language"""
        document_data = {
            'documentId': 'doc-123',
            'propertyId': 'prop-456',
            'ocrText': 'Sample Tamil text',
            'ocrMetadata': {
                'detected_language': 'ta'
            }
        }
        
        mock_detect.return_value = [{
            'text': 'Sample Tamil text',
            'language': 'ta',
            'start': 0,
            'end': 100
        }]
        
        mock_translate.return_value = ('Translated', {})
        
        process_translation(document_data)
        
        # Should call translate with Tamil as source
        translate_call_args = mock_translate.call_args
        assert translate_call_args[0][1] == 'ta'
    
    @patch('handler.update_document_status')
    @patch('handler.store_translation_results')
    @patch('handler.detect_mixed_language_sections')
    @patch('handler.translate_text')
    def test_detects_kannada_language(self, mock_translate, mock_detect, mock_store, mock_update):
        """Test detection of Kannada language"""
        document_data = {
            'documentId': 'doc-123',
            'propertyId': 'prop-456',
            'ocrText': 'Sample Kannada text',
            'ocrMetadata': {
                'detected_language': 'kn'
            }
        }
        
        mock_detect.return_value = [{
            'text': 'Sample Kannada text',
            'language': 'kn',
            'start': 0,
            'end': 100
        }]
        
        mock_translate.return_value = ('Translated', {})
        
        process_translation(document_data)
        
        # Should call translate with Kannada as source
        translate_call_args = mock_translate.call_args
        assert translate_call_args[0][1] == 'kn'
    
    @patch('handler.update_document_status')
    @patch('handler.store_translation_results')
    @patch('handler.detect_mixed_language_sections')
    @patch('handler.translate_text')
    def test_detects_marathi_language(self, mock_translate, mock_detect, mock_store, mock_update):
        """Test detection of Marathi language"""
        document_data = {
            'documentId': 'doc-123',
            'propertyId': 'prop-456',
            'ocrText': 'Sample Marathi text',
            'ocrMetadata': {
                'detected_language': 'mr'
            }
        }
        
        mock_detect.return_value = [{
            'text': 'Sample Marathi text',
            'language': 'mr',
            'start': 0,
            'end': 100
        }]
        
        mock_translate.return_value = ('Translated', {})
        
        process_translation(document_data)
        
        # Should call translate with Marathi as source
        translate_call_args = mock_translate.call_args
        assert translate_call_args[0][1] == 'mr'
    
    @patch('handler.update_document_status')
    @patch('handler.store_translation_results')
    @patch('handler.detect_mixed_language_sections')
    @patch('handler.translate_text')
    def test_detects_telugu_language(self, mock_translate, mock_detect, mock_store, mock_update):
        """Test detection of Telugu language"""
        document_data = {
            'documentId': 'doc-123',
            'propertyId': 'prop-456',
            'ocrText': 'Sample Telugu text',
            'ocrMetadata': {
                'detected_language': 'te'
            }
        }
        
        mock_detect.return_value = [{
            'text': 'Sample Telugu text',
            'language': 'te',
            'start': 0,
            'end': 100
        }]
        
        mock_translate.return_value = ('Translated', {})
        
        process_translation(document_data)
        
        # Should call translate with Telugu as source
        translate_call_args = mock_translate.call_args
        assert translate_call_args[0][1] == 'te'
    
    @patch('handler.update_document_status')
    @patch('handler.store_translation_results')
    @patch('handler.detect_mixed_language_sections')
    def test_skips_translation_for_english(self, mock_detect, mock_store, mock_update):
        """Test that English documents skip translation"""
        document_data = {
            'documentId': 'doc-123',
            'propertyId': 'prop-456',
            'ocrText': 'This is English text',
            'ocrMetadata': {
                'detected_language': 'en'
            }
        }
        
        mock_detect.return_value = [{
            'text': 'This is English text',
            'language': 'en',
            'start': 0,
            'end': 100
        }]
        
        process_translation(document_data)
        
        # Should still store results (with original text as translated)
        assert mock_store.call_count == 1
        store_call_args = mock_store.call_args
        # Original and translated should be the same
        assert store_call_args[0][2] == store_call_args[0][3]


class TestTranslationAPIIntegration:
    """Test suite for Amazon Translate API integration (Requirement 5.1, 5.5)"""
    
    @patch('handler.get_translate_client')
    def test_translate_api_called_with_correct_parameters(self, mock_get_client):
        """Test that Translate API is called with correct parameters"""
        mock_client = Mock()
        mock_client.translate_text.return_value = {
            'TranslatedText': 'Translated text'
        }
        mock_get_client.return_value = mock_client
        
        translate_text('Sample text', 'hi', 'en')
        
        # Verify API call parameters
        call_args = mock_client.translate_text.call_args
        assert call_args[1]['Text'] == 'Sample text'
        assert call_args[1]['SourceLanguageCode'] == 'hi'
        assert call_args[1]['TargetLanguageCode'] == 'en'
    
    @patch('handler.get_translate_client')
    def test_translate_api_uses_formal_language_for_legal_documents(self, mock_get_client):
        """Test that formal language setting is used for legal terminology"""
        mock_client = Mock()
        mock_client.translate_text.return_value = {
            'TranslatedText': 'Translated text'
        }
        mock_get_client.return_value = mock_client
        
        translate_text('Legal document text', 'hi', 'en')
        
        # Verify formal settings for legal context
        call_args = mock_client.translate_text.call_args
        assert call_args[1]['Settings']['Formality'] == 'FORMAL'
    
    @patch('handler.get_translate_client')
    def test_translate_api_handles_client_error(self, mock_get_client):
        """Test handling of Translate API client errors"""
        from botocore.exceptions import ClientError
        
        mock_client = Mock()
        mock_client.translate_text.side_effect = ClientError(
            {'Error': {'Code': 'ThrottlingException', 'Message': 'Rate exceeded'}},
            'TranslateText'
        )
        mock_get_client.return_value = mock_client
        
        # Should raise the error
        with pytest.raises(ClientError):
            translate_text('Sample text', 'hi', 'en')
    
    @patch('handler.get_translate_client')
    def test_translate_api_returns_metadata(self, mock_get_client):
        """Test that translation returns proper metadata"""
        mock_client = Mock()
        mock_client.translate_text.return_value = {
            'TranslatedText': 'Translated text'
        }
        mock_get_client.return_value = mock_client
        
        translated, metadata = translate_text('Sample text', 'hi', 'en')
        
        # Verify metadata structure
        assert 'source_language' in metadata
        assert 'target_language' in metadata
        assert 'source_language_name' in metadata
        assert 'chunk_count' in metadata
        assert metadata['source_language'] == 'hi'
        assert metadata['target_language'] == 'en'


class TestUpdateDocumentStatus:
    """Test suite for update_document_status function"""
    
    @patch('handler.get_documents_table')
    def test_update_document_status_success(self, mock_get_table):
        """Test updating document status without error"""
        mock_table = Mock()
        mock_get_table.return_value = mock_table
        
        update_document_status('doc-123', 'prop-456', 'translation_complete')
        
        assert mock_table.update_item.call_count == 1
        call_args = mock_table.update_item.call_args
        
        assert call_args[1]['Key']['documentId'] == 'doc-123'
        assert call_args[1]['Key']['propertyId'] == 'prop-456'
        
        values = call_args[1]['ExpressionAttributeValues']
        assert values[':status'] == 'translation_complete'
    
    @patch('handler.get_documents_table')
    def test_update_document_status_with_error(self, mock_get_table):
        """Test updating document status with error message"""
        mock_table = Mock()
        mock_get_table.return_value = mock_table
        
        update_document_status(
            'doc-123',
            'prop-456',
            'translation_failed',
            'Translation service unavailable'
        )
        
        assert mock_table.update_item.call_count == 1
        call_args = mock_table.update_item.call_args
        
        values = call_args[1]['ExpressionAttributeValues']
        assert values[':status'] == 'translation_failed'
        assert values[':error'] == 'Translation service unavailable'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])



class TestCalculateTranslationConfidence:
    """Test suite for calculate_translation_confidence function (Requirement 5.4)"""
    
    def test_perfect_confidence_for_good_translation(self):
        """Test that good translations get high confidence scores"""
        original = "यह अनुवाद के लिए उचित लंबाई के साथ एक नमूना पाठ है।"
        translated = "This is a sample text with reasonable length for translation."
        
        confidence, issues = calculate_translation_confidence(original, translated, 'hi')
        
        assert confidence == 100.0
        assert len(issues) == 0
    
    def test_low_confidence_for_empty_translation(self):
        """Test that empty translations get very low confidence"""
        original = "This is some text"
        translated = ""
        
        confidence, issues = calculate_translation_confidence(original, translated, 'hi')
        
        assert confidence < 80.0
        assert len(issues) > 0
        assert any('empty' in issue.lower() or 'short' in issue.lower() for issue in issues)
    
    def test_low_confidence_for_very_short_translation(self):
        """Test that very short translations get low confidence"""
        original = "This is a long text with many words and sentences."
        translated = "Short"
        
        confidence, issues = calculate_translation_confidence(original, translated, 'hi')
        
        assert confidence < 80.0
        assert len(issues) > 0
    
    def test_low_confidence_for_length_ratio_too_small(self):
        """Test that translations much shorter than original get penalized"""
        original = "A" * 100
        translated = "B" * 20  # 20% of original
        
        confidence, issues = calculate_translation_confidence(original, translated, 'hi')
        
        assert confidence < 80.0
        assert any('shorter' in issue.lower() for issue in issues)
    
    def test_low_confidence_for_length_ratio_too_large(self):
        """Test that translations much longer than original get penalized"""
        original = "A" * 100
        translated = "B" * 400  # 4x original
        
        confidence, issues = calculate_translation_confidence(original, translated, 'hi')
        
        assert confidence < 100.0
        assert any('longer' in issue.lower() for issue in issues)
    
    def test_low_confidence_for_few_words(self):
        """Test that translations with very few words get penalized"""
        original = "Some text here"
        translated = "Two words"
        
        confidence, issues = calculate_translation_confidence(original, translated, 'hi')
        
        assert confidence < 100.0
        # Should have at least one issue detected
        assert len(issues) > 0
    
    def test_low_confidence_for_excessive_repetition(self):
        """Test that translations with excessive repetition get penalized"""
        original = "This is original text with many different words"
        translated = "same same same same same same same same same same same same"
        
        confidence, issues = calculate_translation_confidence(original, translated, 'hi')
        
        assert confidence < 100.0
        assert any('repetition' in issue.lower() for issue in issues)
    
    def test_confidence_score_bounded_between_0_and_100(self):
        """Test that confidence score is always between 0 and 100"""
        # Test with extremely bad translation
        original = "A" * 1000
        translated = "B"
        
        confidence, issues = calculate_translation_confidence(original, translated, 'hi')
        
        assert 0.0 <= confidence <= 100.0
    
    def test_returns_list_of_issues(self):
        """Test that function returns a list of detected issues"""
        original = "A" * 100
        translated = "B" * 10
        
        confidence, issues = calculate_translation_confidence(original, translated, 'hi')
        
        assert isinstance(issues, list)
        assert len(issues) > 0
        assert all(isinstance(issue, str) for issue in issues)

