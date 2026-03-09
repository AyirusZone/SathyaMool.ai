"""
Unit tests for Lineage Construction Lambda Handler

Tests cover:
- Simple linear ownership chains
- Gap detection logic
- Circular ownership detection
- Multiple path handling
- Mother Deed identification

Requirements: 7.1, 7.4, 7.6, 7.7
"""

import unittest
from unittest.mock import Mock, patch, MagicMock
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import handler


class TestLineageConstruction(unittest.TestCase):
    """Test lineage construction functionality"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.property_id = 'test-property-123'
    
    def test_simple_linear_chain(self):
        """
        Test simple linear ownership chain: A -> B -> C
        
        Requirements: 7.1, 7.3
        """
        # Create test documents
        documents = [
            {
                'documentId': 'doc1',
                'propertyId': self.property_id,
                'processingStatus': 'analysis_complete',
                'extractedData': {
                    'document_type': 'mother_deed',
                    'original_owner_name': 'Owner A',
                    'grant_date': '1990-01-01',
                    'survey_numbers': ['123/1']
                }
            },
            {
                'documentId': 'doc2',
                'propertyId': self.property_id,
                'processingStatus': 'analysis_complete',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'seller_name': 'Owner A',
                    'buyer_name': 'Owner B',
                    'transaction_date': '2000-05-15',
                    'sale_consideration': '500000',
                    'survey_numbers': ['123/1']
                }
            },
            {
                'documentId': 'doc3',
                'propertyId': self.property_id,
                'processingStatus': 'analysis_complete',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'seller_name': 'Owner B',
                    'buyer_name': 'Owner C',
                    'transaction_date': '2010-08-20',
                    'sale_consideration': '1000000',
                    'survey_numbers': ['123/1']
                }
            }
        ]
        
        # Build graph
        graph_data = handler.build_ownership_graph(documents, self.property_id)
        
        # Assertions
        self.assertEqual(len(graph_data['nodes']), 3)
        self.assertEqual(len(graph_data['edges']), 2)
        
        # Check nodes
        node_names = [node['name'] for node in graph_data['nodes']]
        self.assertIn('Owner A', node_names)
        self.assertIn('Owner B', node_names)
        self.assertIn('Owner C', node_names)
        
        # Check edges
        self.assertEqual(graph_data['edges'][0]['relationship_type'], 'sale')
        self.assertEqual(graph_data['edges'][1]['relationship_type'], 'sale')

    
    def test_mother_deed_identification(self):
        """
        Test Mother Deed identification with explicit marking
        
        Requirements: 7.5
        """
        documents = [
            {
                'documentId': 'doc1',
                'propertyId': self.property_id,
                'processingStatus': 'analysis_complete',
                'extractedData': {
                    'document_type': 'mother_deed',
                    'original_owner_name': 'Original Owner',
                    'grant_date': '1985-03-10',
                    'survey_numbers': ['456/2']
                }
            }
        ]
        
        # Build graph
        graph_data = handler.build_ownership_graph(documents, self.property_id)
        
        # Identify Mother Deed
        mother_deed = handler.identify_mother_deed(graph_data, documents)
        
        # Assertions
        self.assertIsNotNone(mother_deed['node_id'])
        self.assertEqual(mother_deed['owner_name'], 'Original Owner')
        self.assertIn(mother_deed['identification_method'], 
                     ['explicit_mother_deed', 'single_root_node'])
    
    def test_gap_detection_disconnected_chain(self):
        """
        Test gap detection for disconnected ownership chain
        
        Requirements: 7.4
        """
        # Create disconnected chain: A -> B and C -> D (no connection)
        documents = [
            {
                'documentId': 'doc1',
                'propertyId': self.property_id,
                'processingStatus': 'analysis_complete',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'seller_name': 'Owner A',
                    'buyer_name': 'Owner B',
                    'transaction_date': '2000-01-01',
                    'survey_numbers': ['789/3']
                }
            },
            {
                'documentId': 'doc2',
                'propertyId': self.property_id,
                'processingStatus': 'analysis_complete',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'seller_name': 'Owner C',
                    'buyer_name': 'Owner D',
                    'transaction_date': '2010-01-01',
                    'survey_numbers': ['789/3']
                }
            }
        ]
        
        # Build graph
        graph_data = handler.build_ownership_graph(documents, self.property_id)
        
        # Detect gaps
        gaps = handler.detect_ownership_gaps(graph_data)
        
        # Assertions
        self.assertGreater(len(gaps), 0)
        
        # Check for disconnected chain gap
        disconnected_gaps = [g for g in gaps if g['type'] == 'disconnected_chain']
        self.assertGreater(len(disconnected_gaps), 0)
        self.assertEqual(disconnected_gaps[0]['component_count'], 2)
    
    def test_gap_detection_temporal_gap(self):
        """
        Test gap detection for large temporal gaps
        
        Requirements: 7.4
        """
        documents = [
            {
                'documentId': 'doc1',
                'propertyId': self.property_id,
                'processingStatus': 'analysis_complete',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'seller_name': 'Owner A',
                    'buyer_name': 'Owner B',
                    'transaction_date': '1990-01-01',
                    'survey_numbers': ['111/1']
                }
            },
            {
                'documentId': 'doc2',
                'propertyId': self.property_id,
                'processingStatus': 'analysis_complete',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'seller_name': 'Owner B',
                    'buyer_name': 'Owner C',
                    'transaction_date': '2020-01-01',  # 30 year gap
                    'survey_numbers': ['111/1']
                }
            }
        ]
        
        # Build graph
        graph_data = handler.build_ownership_graph(documents, self.property_id)
        
        # Detect gaps
        gaps = handler.detect_ownership_gaps(graph_data)
        
        # Assertions
        temporal_gaps = [g for g in gaps if g['type'] == 'temporal_gap']
        self.assertGreater(len(temporal_gaps), 0)
        self.assertGreater(temporal_gaps[0]['years'], 5)

    
    def test_circular_ownership_detection(self):
        """
        Test circular ownership detection: A -> B -> C -> A
        
        Requirements: 7.7
        """
        # Create graph data with circular pattern
        graph_data = {
            'property_id': self.property_id,
            'nodes': [
                {'id': 0, 'name': 'Owner A', 'normalized_name': 'owner a', 'type': 'owner'},
                {'id': 1, 'name': 'Owner B', 'normalized_name': 'owner b', 'type': 'owner'},
                {'id': 2, 'name': 'Owner C', 'normalized_name': 'owner c', 'type': 'owner'}
            ],
            'edges': [
                {'from': 0, 'to': 1, 'transaction_date': '2000-01-01'},
                {'from': 1, 'to': 2, 'transaction_date': '2005-01-01'},
                {'from': 2, 'to': 0, 'transaction_date': '2010-01-01'}  # Creates cycle
            ]
        }
        
        # Detect circular ownership
        circular_patterns = handler.detect_circular_ownership(graph_data)
        
        # Assertions
        self.assertGreater(len(circular_patterns), 0)
        self.assertEqual(circular_patterns[0]['type'], 'circular_ownership')
        self.assertEqual(circular_patterns[0]['severity'], 'critical')
        self.assertGreaterEqual(circular_patterns[0]['cycle_length'], 3)
    
    def test_multiple_ownership_paths(self):
        """
        Test multiple ownership paths (inheritance split)
        A -> B -> C
             B -> D
        
        Requirements: 7.6, 7.9
        """
        documents = [
            {
                'documentId': 'doc1',
                'propertyId': self.property_id,
                'processingStatus': 'analysis_complete',
                'extractedData': {
                    'document_type': 'mother_deed',
                    'original_owner_name': 'Owner A',
                    'grant_date': '1980-01-01',
                    'survey_numbers': ['222/2']
                }
            },
            {
                'documentId': 'doc2',
                'propertyId': self.property_id,
                'processingStatus': 'analysis_complete',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'seller_name': 'Owner A',
                    'buyer_name': 'Owner B',
                    'transaction_date': '1995-01-01',
                    'survey_numbers': ['222/2']
                }
            },
            {
                'documentId': 'doc3',
                'propertyId': self.property_id,
                'processingStatus': 'analysis_complete',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'seller_name': 'Owner B',
                    'buyer_name': 'Owner C',
                    'transaction_date': '2005-01-01',
                    'survey_numbers': ['222/2'],
                    'family_relationships': ['son of Owner B']
                }
            },
            {
                'documentId': 'doc4',
                'propertyId': self.property_id,
                'processingStatus': 'analysis_complete',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'seller_name': 'Owner B',
                    'buyer_name': 'Owner D',
                    'transaction_date': '2005-01-01',
                    'survey_numbers': ['222/2'],
                    'family_relationships': ['daughter of Owner B']
                }
            }
        ]
        
        # Build graph
        graph_data = handler.build_ownership_graph(documents, self.property_id)
        
        # Find all paths
        paths = handler.find_all_ownership_paths(graph_data)
        
        # Assertions
        self.assertGreaterEqual(len(paths), 2)  # At least 2 paths (to C and D)
    
    def test_inheritance_relationship_detection(self):
        """
        Test detection of inheritance relationship type
        
        Requirements: 7.9
        """
        documents = [
            {
                'documentId': 'doc1',
                'propertyId': self.property_id,
                'processingStatus': 'analysis_complete',
                'extractedData': {
                    'document_type': 'sale_deed',
                    'seller_name': 'Father Name',
                    'buyer_name': 'Son Name',
                    'transaction_date': '2015-01-01',
                    'sale_consideration': 'Nominal consideration',
                    'survey_numbers': ['333/3'],
                    'family_relationships': ['son of Father Name', 'legal heir']
                }
            }
        ]
        
        # Build graph
        graph_data = handler.build_ownership_graph(documents, self.property_id)
        
        # Check relationship type
        self.assertEqual(len(graph_data['edges']), 1)
        self.assertEqual(graph_data['edges'][0]['relationship_type'], 'inheritance')
    
    def test_normalize_owner_name(self):
        """Test owner name normalization for matching"""
        # Test cases
        test_cases = [
            ('John Doe', 'john doe'),
            ('JOHN DOE', 'john doe'),
            ('John  Doe', 'john doe'),  # Multiple spaces
            ('John.Doe', 'johndoe'),  # Period removal
            ('  John Doe  ', 'john doe'),  # Whitespace trimming
        ]
        
        for input_name, expected_output in test_cases:
            result = handler.normalize_owner_name(input_name)
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


if __name__ == '__main__':
    unittest.main()
