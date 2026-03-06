"""
Unit tests for Trust Score Calculation Lambda Handler

Tests cover:
- Base score calculation
- Gap penalty calculation
- Inconsistency penalty calculation
- Survey Number mismatch penalty
- All bonus calculations
- Score bounds (0-100)

Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9
"""

import unittest
from unittest.mock import Mock, patch, MagicMock
import sys
import os
from datetime import datetime, timedelta

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import handler


class TestBaseScoreCalculation(unittest.TestCase):
    """Test base score calculation (Requirement 8.2)"""
    
    def test_base_score_complete_chain(self):
        """Test base score with complete chain (no gaps)"""
        lineage_data = {
            'propertyId': 'test-property-123',
            'gaps': []
        }
        
        score, explanation = handler.calculate_base_score(lineage_data)
        
        self.assertEqual(score, 80)
        self.assertIn('Complete ownership chain', explanation)
    
    def test_base_score_with_gaps(self):
        """Test base score with gaps (still assigns 80, gaps penalized separately)"""
        lineage_data = {
            'propertyId': 'test-property-123',
            'gaps': [
                {'type': 'disconnected_chain', 'severity': 'high'}
            ]
        }
        
        score, explanation = handler.calculate_base_score(lineage_data)
        
        self.assertEqual(score, 80)
        self.assertIn('Base score assigned', explanation)


class TestGapPenaltyCalculation(unittest.TestCase):
    """Test gap penalty calculation (Requirement 8.3)"""
    
    def test_no_gaps(self):
        """Test gap penalty with no gaps"""
        lineage_data = {
            'gaps': []
        }
        
        penalty, explanation = handler.calculate_gap_penalty(lineage_data)
        
        self.assertEqual(penalty, 0)
        self.assertIn('No gaps detected', explanation)
    
    def test_single_gap(self):
        """Test gap penalty with single gap"""
        lineage_data = {
            'gaps': [
                {
                    'type': 'disconnected_chain',
                    'severity': 'high',
                    'description': 'Ownership chain has 2 disconnected segments'
                }
            ]
        }
        
        penalty, explanation = handler.calculate_gap_penalty(lineage_data)
        
        self.assertEqual(penalty, -15)
        self.assertIn('Deducted 15 points', explanation)
    
    def test_multiple_gaps(self):
        """Test gap penalty with multiple gaps"""
        lineage_data = {
            'gaps': [
                {
                    'type': 'disconnected_chain',
                    'severity': 'high',
                    'description': 'Ownership chain has 2 disconnected segments'
                },
                {
                    'type': 'multiple_terminal_owners',
                    'severity': 'high',
                    'description': 'Multiple potential current owners detected'
                }
            ]
        }
        
        penalty, explanation = handler.calculate_gap_penalty(lineage_data)
        
        self.assertEqual(penalty, -30)
        self.assertIn('Deducted 30 points', explanation)
        self.assertIn('2 gap(s)', explanation)
    
    def test_temporal_gaps_not_counted(self):
        """Test that temporal gaps are not counted as critical gaps"""
        lineage_data = {
            'gaps': [
                {
                    'type': 'temporal_gap',
                    'severity': 'medium',
                    'description': 'Large time gap of 7 years'
                }
            ]
        }
        
        penalty, explanation = handler.calculate_gap_penalty(lineage_data)
        
        self.assertEqual(penalty, 0)


class TestInconsistencyPenaltyCalculation(unittest.TestCase):
    """Test inconsistency penalty calculation (Requirement 8.4)"""
    
    def test_no_inconsistencies(self):
        """Test inconsistency penalty with no inconsistencies"""
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'transaction_date': '2000-01-15'
                }
            },
            {
                'documentId': 'doc2',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'transaction_date': '2010-06-20'
                }
            }
        ]
        
        penalty, explanation = handler.calculate_inconsistency_penalty(documents)
        
        self.assertEqual(penalty, 0)
        self.assertIn('No date inconsistencies', explanation)
    
    def test_future_date_inconsistency(self):
        """Test inconsistency penalty with future date"""
        future_date = (datetime.now() + timedelta(days=365)).strftime('%Y-%m-%d')
        
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'transaction_date': future_date
                }
            }
        ]
        
        penalty, explanation = handler.calculate_inconsistency_penalty(documents)
        
        self.assertEqual(penalty, -10)
        self.assertIn('Future date detected', explanation)
    
    def test_old_date_inconsistency(self):
        """Test inconsistency penalty with suspiciously old date"""
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'transaction_date': '1850-01-01'
                }
            }
        ]
        
        penalty, explanation = handler.calculate_inconsistency_penalty(documents)
        
        self.assertEqual(penalty, -10)
        self.assertIn('Suspiciously old date', explanation)
    
    def test_multiple_inconsistencies(self):
        """Test inconsistency penalty with multiple inconsistencies"""
        future_date = (datetime.now() + timedelta(days=365)).strftime('%Y-%m-%d')
        
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'transaction_date': future_date
                }
            },
            {
                'documentId': 'doc2',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'transaction_date': '1850-01-01'
                }
            }
        ]
        
        penalty, explanation = handler.calculate_inconsistency_penalty(documents)
        
        self.assertEqual(penalty, -20)
        self.assertIn('2 date inconsistency(ies)', explanation)


class TestSurveyNumberPenalty(unittest.TestCase):
    """Test Survey Number mismatch penalty (Requirement 8.5)"""
    
    def test_no_survey_numbers(self):
        """Test penalty with no Survey Numbers"""
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed'
                }
            }
        ]
        
        penalty, explanation = handler.calculate_survey_number_penalty(documents)
        
        self.assertEqual(penalty, 0)
        self.assertIn('No Survey Numbers found', explanation)
    
    def test_matching_survey_numbers(self):
        """Test penalty with matching Survey Numbers"""
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'survey_numbers': ['123/1']
                }
            },
            {
                'documentId': 'doc2',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'survey_numbers': ['123/1']
                }
            }
        ]
        
        penalty, explanation = handler.calculate_survey_number_penalty(documents)
        
        self.assertEqual(penalty, 0)
        self.assertIn('same Survey Number', explanation)
    
    def test_mismatched_survey_numbers(self):
        """Test penalty with mismatched Survey Numbers"""
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'survey_numbers': ['123/1']
                }
            },
            {
                'documentId': 'doc2',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'survey_numbers': ['456/2']
                }
            }
        ]
        
        penalty, explanation = handler.calculate_survey_number_penalty(documents)
        
        self.assertEqual(penalty, -20)
        self.assertIn('Survey Number mismatch', explanation)
    
    def test_normalized_survey_numbers(self):
        """Test that Survey Numbers are normalized before comparison"""
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'survey_numbers': ['Survey No. 123/1']
                }
            },
            {
                'documentId': 'doc2',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'survey_numbers': ['Sy.No. 123/1']
                }
            }
        ]
        
        penalty, explanation = handler.calculate_survey_number_penalty(documents)
        
        # Should match after normalization
        self.assertEqual(penalty, 0)


class TestEncumbranceCertificateBonus(unittest.TestCase):
    """Test Encumbrance Certificate bonus (Requirement 8.6)"""
    
    def test_no_ec_provided(self):
        """Test bonus with no EC provided"""
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed'
                }
            }
        ]
        
        bonus, explanation = handler.calculate_ec_bonus(documents)
        
        self.assertEqual(bonus, 0)
        self.assertIn('No Encumbrance Certificate', explanation)
    
    def test_ec_with_no_sale_deeds(self):
        """Test bonus with EC but no Sale Deeds"""
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'encumbrance_certificate',
                    'transaction_entries': []
                }
            }
        ]
        
        bonus, explanation = handler.calculate_ec_bonus(documents)
        
        self.assertEqual(bonus, 0)
        self.assertIn('no Sale Deeds', explanation)
    
    def test_ec_with_matching_transactions(self):
        """Test bonus with EC matching Sale Deed transactions"""
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'transaction_date': '2010-05-15'
                }
            },
            {
                'documentId': 'doc2',
                'extractedData': {
                    'document_type': 'encumbrance_certificate',
                    'transaction_entries': [
                        {'date': '2010-05-15', 'type': 'sale'}
                    ]
                }
            }
        ]
        
        bonus, explanation = handler.calculate_ec_bonus(documents)
        
        self.assertEqual(bonus, 10)
        self.assertIn('Added 10 points', explanation)
        self.assertIn('matched', explanation)
    
    def test_ec_with_no_matching_transactions(self):
        """Test bonus with EC but no matching transactions"""
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'transaction_date': '2010-05-15'
                }
            },
            {
                'documentId': 'doc2',
                'extractedData': {
                    'document_type': 'encumbrance_certificate',
                    'transaction_entries': [
                        {'date': '2015-08-20', 'type': 'sale'}
                    ]
                }
            }
        ]
        
        bonus, explanation = handler.calculate_ec_bonus(documents)
        
        self.assertEqual(bonus, 0)
        self.assertIn('no matching transactions', explanation)


class TestRecencyBonus(unittest.TestCase):
    """Test recency bonus (Requirement 8.7)"""
    
    def test_all_documents_recent(self):
        """Test bonus with all documents < 30 years old"""
        recent_date = (datetime.now() - timedelta(days=20*365)).strftime('%Y-%m-%d')
        
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'transaction_date': recent_date
                }
            }
        ]
        
        bonus, explanation = handler.calculate_recency_bonus(documents)
        
        self.assertEqual(bonus, 5)
        self.assertIn('Added 5 points', explanation)
        self.assertIn('recent documents', explanation)
    
    def test_old_documents(self):
        """Test bonus with documents > 30 years old"""
        old_date = (datetime.now() - timedelta(days=40*365)).strftime('%Y-%m-%d')
        
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'transaction_date': old_date
                }
            }
        ]
        
        bonus, explanation = handler.calculate_recency_bonus(documents)
        
        self.assertEqual(bonus, 0)
        self.assertIn('No recency bonus', explanation)
    
    def test_mixed_document_ages(self):
        """Test bonus with mixed document ages (oldest determines bonus)"""
        recent_date = (datetime.now() - timedelta(days=10*365)).strftime('%Y-%m-%d')
        old_date = (datetime.now() - timedelta(days=40*365)).strftime('%Y-%m-%d')
        
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'transaction_date': recent_date
                }
            },
            {
                'documentId': 'doc2',
                'extractedData': {
                    'document_type': 'mother_deed',
                    'grant_date': old_date
                }
            }
        ]
        
        bonus, explanation = handler.calculate_recency_bonus(documents)
        
        self.assertEqual(bonus, 0)


class TestSuccessionBonus(unittest.TestCase):
    """Test succession bonus (Requirement 8.8)"""
    
    def test_no_succession_documentation(self):
        """Test bonus with no succession documentation"""
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'family_relationships': []
                }
            }
        ]
        
        bonus, explanation = handler.calculate_succession_bonus(documents)
        
        self.assertEqual(bonus, 0)
        self.assertIn('No documented family succession', explanation)
    
    def test_legal_heir_certificate(self):
        """Test bonus with legal heir certificate"""
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'family_relationships': ['son of deceased', 'legal heir certificate']
                }
            }
        ]
        
        bonus, explanation = handler.calculate_succession_bonus(documents)
        
        self.assertEqual(bonus, 5)
        self.assertIn('Added 5 points', explanation)
        self.assertIn('documented family succession', explanation)
    
    def test_succession_certificate(self):
        """Test bonus with succession certificate"""
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'family_relationships': ['succession certificate issued']
                }
            }
        ]
        
        bonus, explanation = handler.calculate_succession_bonus(documents)
        
        self.assertEqual(bonus, 5)
    
    def test_will_testament(self):
        """Test bonus with will/testament"""
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'family_relationships': ['as per will dated 2010-01-01']
                }
            }
        ]
        
        bonus, explanation = handler.calculate_succession_bonus(documents)
        
        self.assertEqual(bonus, 5)


class TestScoreBounds(unittest.TestCase):
    """Test score bounds (Requirement 8.9)"""
    
    def test_score_clamped_to_zero(self):
        """Test that negative scores are clamped to 0"""
        # Simulate a score calculation that would result in negative
        lineage_data = {
            'gaps': [
                {'type': 'disconnected_chain', 'severity': 'high', 'description': 'Gap 1'},
                {'type': 'disconnected_chain', 'severity': 'high', 'description': 'Gap 2'},
                {'type': 'disconnected_chain', 'severity': 'high', 'description': 'Gap 3'},
                {'type': 'disconnected_chain', 'severity': 'high', 'description': 'Gap 4'},
                {'type': 'disconnected_chain', 'severity': 'high', 'description': 'Gap 5'},
                {'type': 'disconnected_chain', 'severity': 'high', 'description': 'Gap 6'}
            ]
        }
        
        base_score, _ = handler.calculate_base_score(lineage_data)
        gap_penalty, _ = handler.calculate_gap_penalty(lineage_data)
        
        raw_score = base_score + gap_penalty  # 80 + (-90) = -10
        final_score = max(0, min(100, raw_score))
        
        self.assertEqual(final_score, 0)
    
    def test_score_clamped_to_hundred(self):
        """Test that scores > 100 are clamped to 100"""
        # This shouldn't happen in practice, but test the bounds
        raw_score = 120
        final_score = max(0, min(100, raw_score))
        
        self.assertEqual(final_score, 100)
    
    def test_score_within_bounds(self):
        """Test that valid scores remain unchanged"""
        raw_score = 85
        final_score = max(0, min(100, raw_score))
        
        self.assertEqual(final_score, 85)


class TestHelperFunctions(unittest.TestCase):
    """Test helper functions"""
    
    def test_normalize_survey_number(self):
        """Test Survey Number normalization"""
        test_cases = [
            ('Survey No. 123/1', '123/1'),
            ('Sy.No. 456/2', '456/2'),
            ('S.No. 789-3', '789-3'),
            ('123/1', '123/1'),
            ('  Survey No. 111/1  ', '111/1')
        ]
        
        for input_sn, expected_output in test_cases:
            result = handler.normalize_survey_number(input_sn)
            self.assertEqual(result, expected_output)
    
    def test_parse_date_safely(self):
        """Test date parsing with various formats"""
        # Test ISO format
        date1 = handler.parse_date_safely('2020-01-15')
        self.assertIsNotNone(date1)
        self.assertEqual(date1.year, 2020)
        self.assertEqual(date1.month, 1)
        self.assertEqual(date1.day, 15)
        
        # Test DD/MM/YYYY format
        date2 = handler.parse_date_safely('15/01/2020')
        self.assertIsNotNone(date2)
        self.assertEqual(date2.year, 2020)
        
        # Test invalid date
        date3 = handler.parse_date_safely('invalid-date')
        self.assertIsNone(date3)
    
    def test_generate_score_summary(self):
        """Test score summary generation"""
        # Test Excellent rating
        summary = handler.generate_score_summary(95, [])
        self.assertIn('Excellent', summary)
        self.assertIn('95/100', summary)
        
        # Test Good rating
        summary = handler.generate_score_summary(80, [])
        self.assertIn('Good', summary)
        
        # Test Fair rating
        summary = handler.generate_score_summary(65, [])
        self.assertIn('Fair', summary)
        
        # Test Poor rating
        summary = handler.generate_score_summary(45, [])
        self.assertIn('Poor', summary)
        
        # Test Very Poor rating
        summary = handler.generate_score_summary(25, [])
        self.assertIn('Very Poor', summary)


class TestDynamoDBDeserialization(unittest.TestCase):
    """Test DynamoDB Stream item deserialization"""
    
    def test_deserialize_simple_types(self):
        """Test deserialization of simple DynamoDB types"""
        item = {
            'stringField': {'S': 'test value'},
            'numberField': {'N': '123.45'},
            'boolField': {'BOOL': True},
            'nullField': {'NULL': True}
        }
        
        result = handler.deserialize_dynamodb_item(item)
        
        self.assertEqual(result['stringField'], 'test value')
        self.assertEqual(result['numberField'], 123.45)
        self.assertEqual(result['boolField'], True)
        self.assertIsNone(result['nullField'])
    
    def test_deserialize_nested_map(self):
        """Test deserialization of nested map"""
        item = {
            'mapField': {
                'M': {
                    'nestedString': {'S': 'nested value'},
                    'nestedNumber': {'N': '42'}
                }
            }
        }
        
        result = handler.deserialize_dynamodb_item(item)
        
        self.assertEqual(result['mapField']['nestedString'], 'nested value')
        self.assertEqual(result['mapField']['nestedNumber'], 42)


class TestIntegrationScenarios(unittest.TestCase):
    """Test complete Trust Score calculation scenarios"""
    
    def test_perfect_property(self):
        """Test Trust Score for a perfect property"""
        # Perfect property: complete chain, no gaps, recent docs, EC matches, succession documented
        lineage_data = {
            'propertyId': 'perfect-property',
            'gaps': []
        }
        
        recent_date = (datetime.now() - timedelta(days=10*365)).strftime('%Y-%m-%d')
        
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'transaction_date': recent_date,
                    'survey_numbers': ['123/1'],
                    'family_relationships': ['legal heir certificate']
                }
            },
            {
                'documentId': 'doc2',
                'extractedData': {
                    'document_type': 'encumbrance_certificate',
                    'transaction_entries': [
                        {'date': recent_date, 'type': 'sale'}
                    ]
                }
            }
        ]
        
        # Calculate components
        base_score, _ = handler.calculate_base_score(lineage_data)
        gap_penalty, _ = handler.calculate_gap_penalty(lineage_data)
        inconsistency_penalty, _ = handler.calculate_inconsistency_penalty(documents)
        survey_penalty, _ = handler.calculate_survey_number_penalty(documents)
        ec_bonus, _ = handler.calculate_ec_bonus(documents)
        recency_bonus, _ = handler.calculate_recency_bonus(documents)
        succession_bonus, _ = handler.calculate_succession_bonus(documents)
        
        total_score = base_score + gap_penalty + inconsistency_penalty + survey_penalty + ec_bonus + recency_bonus + succession_bonus
        final_score = max(0, min(100, total_score))
        
        # Should be 80 + 0 + 0 + 0 + 10 + 5 + 5 = 100
        self.assertEqual(final_score, 100)
    
    def test_problematic_property(self):
        """Test Trust Score for a problematic property"""
        # Problematic property: gaps, inconsistencies, mismatched survey numbers
        lineage_data = {
            'propertyId': 'problematic-property',
            'gaps': [
                {'type': 'disconnected_chain', 'severity': 'high', 'description': 'Gap 1'},
                {'type': 'multiple_terminal_owners', 'severity': 'high', 'description': 'Gap 2'}
            ]
        }
        
        future_date = (datetime.now() + timedelta(days=365)).strftime('%Y-%m-%d')
        
        documents = [
            {
                'documentId': 'doc1',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'transaction_date': future_date,
                    'survey_numbers': ['123/1']
                }
            },
            {
                'documentId': 'doc2',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'transaction_date': '1850-01-01',  # Old date
                    'survey_numbers': ['456/2']
                }
            }
        ]
        
        # Calculate components
        base_score, _ = handler.calculate_base_score(lineage_data)
        gap_penalty, _ = handler.calculate_gap_penalty(lineage_data)
        inconsistency_penalty, _ = handler.calculate_inconsistency_penalty(documents)
        survey_penalty, _ = handler.calculate_survey_number_penalty(documents)
        ec_bonus, _ = handler.calculate_ec_bonus(documents)
        recency_bonus, _ = handler.calculate_recency_bonus(documents)
        succession_bonus, _ = handler.calculate_succession_bonus(documents)
        
        total_score = base_score + gap_penalty + inconsistency_penalty + survey_penalty + ec_bonus + recency_bonus + succession_bonus
        final_score = max(0, min(100, total_score))
        
        # Should be 80 + (-30) + (-20) + (-20) + 0 + 0 + 0 = 10
        # (Two inconsistencies: future date and old date < 1900)
        self.assertEqual(final_score, 10)


if __name__ == '__main__':
    unittest.main()
