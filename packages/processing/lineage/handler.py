"""
Lineage Construction Lambda Function for SatyaMool

This Lambda function is triggered when all documents for a property reach
"analysis_complete" status. It constructs a directed acyclic graph (DAG)
representing the ownership lineage, identifies the Mother Deed, detects gaps,
handles multiple ownership paths, and detects circular ownership patterns.

Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9
"""

import json
import os
import boto3
import logging
from typing import Dict, Any, List, Optional, Set, Tuple
from datetime import datetime, timezone
from collections import defaultdict, deque
from botocore.exceptions import ClientError

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
DOCUMENTS_TABLE_NAME = os.environ.get('DOCUMENTS_TABLE_NAME', 'SatyaMool-Documents')
PROPERTIES_TABLE_NAME = os.environ.get('PROPERTIES_TABLE_NAME', 'SatyaMool-Properties')
LINEAGE_TABLE_NAME = os.environ.get('LINEAGE_TABLE_NAME', 'SatyaMool-Lineage')

# AWS clients (lazy initialization)
_dynamodb = None
_documents_table = None
_properties_table = None
_lineage_table = None


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


def get_properties_table():
    """Get or create Properties table"""
    global _properties_table
    if _properties_table is None:
        dynamodb = get_dynamodb_resource()
        _properties_table = dynamodb.Table(PROPERTIES_TABLE_NAME)
    return _properties_table


def get_lineage_table():
    """Get or create Lineage table"""
    global _lineage_table
    if _lineage_table is None:
        dynamodb = get_dynamodb_resource()
        _lineage_table = dynamodb.Table(LINEAGE_TABLE_NAME)
    return _lineage_table


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main Lambda handler for lineage construction.
    
    Triggered by DynamoDB Streams when documents reach "analysis_complete" status.
    Checks if all documents for a property are analyzed, then constructs lineage.
    
    Requirements: 7.1, 7.2
    
    Args:
        event: DynamoDB Stream event
        context: Lambda context
        
    Returns:
        Response with processing statistics
    """
    logger.info(f"Received DynamoDB Stream event with {len(event.get('Records', []))} records")
    
    processed_properties = set()
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
            
            # Filter for documents with "analysis_complete" status
            processing_status = document_data.get('processingStatus')
            if processing_status != 'analysis_complete':
                logger.debug(f"Skipping document with status: {processing_status}")
                skipped_count += 1
                continue

            
            # Get property ID
            property_id = document_data.get('propertyId')
            if not property_id:
                logger.warning("No propertyId in document")
                skipped_count += 1
                continue
            
            # Check if all documents for this property are analyzed
            if check_all_documents_analyzed(property_id):
                # Avoid processing the same property multiple times in this batch
                if property_id not in processed_properties:
                    logger.info(f"All documents analyzed for property {property_id}, constructing lineage")
                    construct_lineage_for_property(property_id)
                    processed_properties.add(property_id)
            else:
                logger.debug(f"Not all documents analyzed yet for property {property_id}")
                skipped_count += 1
            
        except Exception as e:
            logger.error(f"Error processing record: {str(e)}", exc_info=True)
            failed_count += 1
            # Continue processing other records
    
    logger.info(
        f"Lineage processing complete. "
        f"Properties processed: {len(processed_properties)}, Skipped: {skipped_count}, Failed: {failed_count}"
    )
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'properties_processed': len(processed_properties),
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



def check_all_documents_analyzed(property_id: str) -> bool:
    """
    Check if all documents for a property have been analyzed.
    
    Args:
        property_id: Property ID
        
    Returns:
        True if all documents are analyzed, False otherwise
    """
    documents_table = get_documents_table()
    
    try:
        response = documents_table.query(
            IndexName='propertyId-uploadedAt-index',
            KeyConditionExpression='propertyId = :property_id',
            ExpressionAttributeValues={
                ':property_id': property_id
            }
        )
        
        documents = response.get('Items', [])
        
        if not documents:
            logger.warning(f"No documents found for property {property_id}")
            return False
        
        # Check if all non-failed documents have analysis_complete status (Requirement 3.7)
        # Documents with *_failed status are permanently failed and should not block the pipeline
        TERMINAL_FAILED_STATUSES = {'ocr_failed', 'translation_failed', 'analysis_failed'}
        eligible_docs = [doc for doc in documents if doc.get('processingStatus') not in TERMINAL_FAILED_STATUSES]
        
        if not eligible_docs:
            logger.warning(f"All documents for property {property_id} are in failed states, skipping lineage")
            return False
        
        for doc in eligible_docs:
            status = doc.get('processingStatus', '')
            if status != 'analysis_complete':
                logger.debug(f"Document {doc.get('documentId')} has status {status}, skipping lineage")
                return False
        
        failed_count = len(documents) - len(eligible_docs)
        if failed_count > 0:
            logger.warning(f"Proceeding with lineage for property {property_id}: {len(eligible_docs)} analysis_complete, {failed_count} permanently failed (skipped)")
        else:
            logger.info(f"All {len(documents)} documents are analysis_complete for property {property_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error checking document status: {str(e)}", exc_info=True)
        return False


def construct_lineage_for_property(property_id: str) -> None:
    """
    Construct ownership lineage graph for a property.
    
    This is the main orchestration function that:
    1. Retrieves all analyzed documents
    2. Builds the ownership graph
    3. Identifies Mother Deed
    4. Detects gaps and circular ownership
    5. Handles multiple paths
    6. Stores the lineage graph
    
    Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9
    
    Args:
        property_id: Property ID
    """
    logger.info(f"Constructing lineage for property {property_id}")
    
    try:
        # Retrieve all extracted structured data (Requirement 7.2)
        documents = retrieve_property_documents(property_id)
        
        if not documents:
            logger.warning(f"No documents found for property {property_id}")
            return
        
        # Build directed graph (Requirement 7.1, 7.3)
        graph_data = build_ownership_graph(documents, property_id)
        
        # Identify Mother Deed (Requirement 7.5)
        mother_deed_info = identify_mother_deed(graph_data, documents)
        graph_data['mother_deed'] = mother_deed_info
        
        # Detect gaps in ownership chain (Requirement 7.4)
        gaps = detect_ownership_gaps(graph_data)
        graph_data['gaps'] = gaps
        
        # Handle multiple ownership paths (Requirement 7.6, 7.9)
        paths = find_all_ownership_paths(graph_data)
        graph_data['ownership_paths'] = paths
        
        # Detect circular ownership (Requirement 7.7)
        circular_patterns = detect_circular_ownership(graph_data)
        graph_data['circular_patterns'] = circular_patterns
        
        # Store lineage graph (Requirement 7.1)
        store_lineage_graph(property_id, graph_data)
        
        # Update all documents and property status to "lineage_complete" (Requirements 3.4, 3.6)
        update_all_documents_status(property_id, 'lineage_complete')
        
        logger.info(f"Successfully constructed lineage for property {property_id}")
        
    except Exception as e:
        logger.error(f"Error constructing lineage for property {property_id}: {str(e)}", exc_info=True)
        update_all_documents_status(property_id, 'lineage_failed', str(e))
        raise



def retrieve_property_documents(property_id: str) -> List[Dict[str, Any]]:
    """
    Retrieve all analyzed documents for a property.
    
    Requirements: 7.2
    
    Args:
        property_id: Property ID
        
    Returns:
        List of document data with extracted information
    """
    documents_table = get_documents_table()
    
    response = documents_table.query(
        IndexName='propertyId-uploadedAt-index',
        KeyConditionExpression='propertyId = :property_id',
        ExpressionAttributeValues={
            ':property_id': property_id
        }
    )
    
    documents = response.get('Items', [])
    
    # Filter for successfully analyzed documents
    analyzed_documents = [
        doc for doc in documents
        if doc.get('processingStatus') == 'analysis_complete'
        and doc.get('extractedData')
    ]
    
    logger.info(f"Retrieved {len(analyzed_documents)} analyzed documents for property {property_id}")
    
    return analyzed_documents


def build_ownership_graph(documents: List[Dict[str, Any]], property_id: str) -> Dict[str, Any]:
    """
    Build directed acyclic graph (DAG) with owners as nodes and transfers as edges.
    
    Requirements: 7.1, 7.3, 7.8, 7.9
    
    Args:
        documents: List of analyzed documents
        property_id: Property ID
        
    Returns:
        Graph data structure with nodes and edges
    """
    logger.info(f"Building ownership graph for property {property_id}")
    
    nodes = {}  # owner_name -> node data
    edges = []  # list of edge data
    node_id_counter = 0
    
    # Process each document to extract ownership transfers
    for doc in documents:
        extracted_data = doc.get('extractedData', {})
        document_type = extracted_data.get('document_type', 'unknown')
        document_id = doc.get('documentId')
        
        if document_type == 'sale_deed':
            # Extract buyer and seller (Requirement 7.3)
            seller_name = extracted_data.get('seller_name')
            buyer_name = extracted_data.get('buyer_name')
            transaction_date = extracted_data.get('transaction_date')
            
            if seller_name and buyer_name:
                # Create or get seller node
                seller_node_id = get_or_create_node(
                    nodes, seller_name, node_id_counter, 'owner'
                )
                if seller_node_id >= node_id_counter:
                    node_id_counter = seller_node_id + 1
                
                # Create or get buyer node
                buyer_node_id = get_or_create_node(
                    nodes, buyer_name, node_id_counter, 'owner'
                )
                if buyer_node_id >= node_id_counter:
                    node_id_counter = buyer_node_id + 1
                
                # Create edge from seller to buyer (Requirement 7.3, 7.8)
                edge = {
                    'from': seller_node_id,
                    'to': buyer_node_id,
                    'transaction_date': transaction_date,
                    'document_id': document_id,
                    'document_type': 'sale_deed',
                    'relationship_type': 'sale',  # Requirement 7.9
                    'sale_consideration': extracted_data.get('sale_consideration'),
                    'registration_details': extracted_data.get('registration_details', {})
                }
                edges.append(edge)

        
        elif document_type == 'mother_deed':
            # Extract original owner
            original_owner = extracted_data.get('original_owner_name')
            grant_date = extracted_data.get('grant_date')
            
            if original_owner:
                # Create or get original owner node
                owner_node_id = get_or_create_node(
                    nodes, original_owner, node_id_counter, 'original_owner'
                )
                if owner_node_id >= node_id_counter:
                    node_id_counter = owner_node_id + 1
                
                # Mark this node as Mother Deed root (use normalized name as key)
                normalized_name = normalize_owner_name(original_owner)
                nodes[normalized_name]['is_mother_deed'] = True
                nodes[normalized_name]['grant_date'] = grant_date
                nodes[normalized_name]['document_id'] = document_id
        
        # Handle family relationships for inheritance (Requirement 7.9)
        family_relationships = extracted_data.get('family_relationships', [])
        if family_relationships and document_type == 'sale_deed':
            # Check if this is an inheritance or gift transfer
            relationship_type = determine_relationship_type(extracted_data, family_relationships)
            if relationship_type in ['inheritance', 'gift']:
                # Update the last edge's relationship type
                if edges:
                    edges[-1]['relationship_type'] = relationship_type
    
    # Convert nodes dict to list format
    nodes_list = []
    for name, node_data in nodes.items():
        nodes_list.append(node_data)
    
    # Calculate time spans between consecutive transfers (Requirement 7.8)
    edges = calculate_time_spans(edges)
    
    graph_data = {
        'property_id': property_id,
        'nodes': nodes_list,
        'edges': edges,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    logger.info(f"Built graph with {len(nodes_list)} nodes and {len(edges)} edges")
    
    return graph_data


def get_or_create_node(
    nodes: Dict[str, Dict[str, Any]],
    owner_name: str,
    node_id_counter: int,
    node_type: str
) -> int:
    """
    Get existing node or create new node for an owner.
    
    Args:
        nodes: Dictionary of existing nodes
        owner_name: Owner name
        node_id_counter: Current node ID counter
        node_type: Type of node ('owner', 'original_owner')
        
    Returns:
        Node ID
    """
    # Normalize name for matching
    normalized_name = normalize_owner_name(owner_name)
    
    # Check if node already exists
    if normalized_name in nodes:
        return nodes[normalized_name]['id']
    
    # Create new node
    node_id = node_id_counter
    nodes[normalized_name] = {
        'id': node_id,
        'name': owner_name,
        'normalized_name': normalized_name,
        'type': node_type,
        'is_mother_deed': False
    }
    
    return node_id


def normalize_owner_name(name: str) -> str:
    """
    Normalize owner name for matching (handle variations).
    
    Requirements: 18.6
    
    Args:
        name: Owner name
        
    Returns:
        Normalized name
    """
    if not name:
        return ""
    
    # Convert to lowercase and strip whitespace
    normalized = name.lower().strip()
    
    # Remove common variations in spacing
    normalized = ' '.join(normalized.split())
    
    # Remove periods from abbreviations
    normalized = normalized.replace('.', '')
    
    return normalized



def determine_relationship_type(
    extracted_data: Dict[str, Any],
    family_relationships: List[str]
) -> str:
    """
    Determine relationship type based on extracted data and family relationships.
    
    Requirements: 7.9
    
    Args:
        extracted_data: Extracted document data
        family_relationships: List of family relationships
        
    Returns:
        Relationship type: 'sale', 'inheritance', or 'gift'
    """
    # Check for inheritance indicators
    inheritance_keywords = ['heir', 'succession', 'inheritance', 'legal heir', 'will', 'testament']
    
    # Check document text or relationships for inheritance indicators
    for relationship in family_relationships:
        relationship_lower = relationship.lower()
        if any(keyword in relationship_lower for keyword in inheritance_keywords):
            return 'inheritance'
    
    # Check for gift indicators
    gift_keywords = ['gift', 'donation', 'settlement']
    sale_consideration = extracted_data.get('sale_consideration', '')
    
    if sale_consideration:
        sale_consideration_lower = str(sale_consideration).lower()
        if any(keyword in sale_consideration_lower for keyword in gift_keywords):
            return 'gift'
        
        # Check for nominal consideration (indicates gift)
        if 'nominal' in sale_consideration_lower or '1' in sale_consideration_lower:
            return 'gift'
    
    # Default to sale
    return 'sale'


def calculate_time_spans(edges: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Calculate time spans between consecutive transfers.
    
    Requirements: 7.8
    
    Args:
        edges: List of edges
        
    Returns:
        Updated edges with time spans
    """
    # Sort edges by transaction date
    sorted_edges = sorted(
        edges,
        key=lambda e: parse_date_safely(e.get('transaction_date', ''))
    )
    
    # Calculate time spans
    for i in range(len(sorted_edges) - 1):
        current_date = parse_date_safely(sorted_edges[i].get('transaction_date', ''))
        next_date = parse_date_safely(sorted_edges[i + 1].get('transaction_date', ''))
        
        if current_date and next_date:
            time_span_days = (next_date - current_date).days
            sorted_edges[i]['time_span_to_next'] = {
                'days': time_span_days,
                'years': round(time_span_days / 365.25, 2)
            }
    
    return sorted_edges


def parse_date_safely(date_str: str) -> Optional[datetime]:
    """
    Parse date string safely, handling various formats.
    
    Args:
        date_str: Date string
        
    Returns:
        Datetime object or None if parsing fails
    """
    if not date_str:
        return None
    
    # Try ISO format first
    try:
        return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
    except:
        pass
    
    # Try common Indian date formats
    formats = [
        '%d/%m/%Y',
        '%d-%m-%Y',
        '%Y-%m-%d',
        '%d.%m.%Y',
        '%d %B %Y',
        '%d %b %Y'
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except:
            continue
    
    logger.warning(f"Could not parse date: {date_str}")
    return None



def identify_mother_deed(
    graph_data: Dict[str, Any],
    documents: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Identify Mother Deed as the root node of the ownership graph.
    
    Requirements: 7.5
    
    Args:
        graph_data: Graph data structure
        documents: List of documents
        
    Returns:
        Mother Deed information
    """
    logger.info("Identifying Mother Deed")
    
    nodes = graph_data.get('nodes', [])
    edges = graph_data.get('edges', [])
    
    # Strategy 1: Look for nodes explicitly marked as Mother Deed
    for node in nodes:
        if node.get('is_mother_deed'):
            logger.info(f"Found Mother Deed: {node.get('name')}")
            return {
                'node_id': node.get('id'),
                'owner_name': node.get('name'),
                'grant_date': node.get('grant_date'),
                'document_id': node.get('document_id'),
                'identification_method': 'explicit_mother_deed'
            }
    
    # Strategy 2: Find root nodes (nodes with no incoming edges)
    nodes_with_incoming = set()
    for edge in edges:
        nodes_with_incoming.add(edge.get('to'))
    
    root_nodes = [node for node in nodes if node.get('id') not in nodes_with_incoming]
    
    if len(root_nodes) == 1:
        # Single root node - this is the Mother Deed
        root_node = root_nodes[0]
        logger.info(f"Identified Mother Deed by root node: {root_node.get('name')}")
        return {
            'node_id': root_node.get('id'),
            'owner_name': root_node.get('name'),
            'identification_method': 'single_root_node',
            'document_id': root_node.get('document_id')
        }
    
    elif len(root_nodes) > 1:
        # Multiple root nodes - find the earliest one by date
        logger.warning(f"Found {len(root_nodes)} potential root nodes")
        
        earliest_root = None
        earliest_date = None
        
        for root_node in root_nodes:
            # Find documents associated with this node
            for doc in documents:
                extracted_data = doc.get('extractedData', {})
                owner_name = extracted_data.get('original_owner_name') or extracted_data.get('seller_name')
                
                if normalize_owner_name(owner_name) == root_node.get('normalized_name'):
                    date_str = extracted_data.get('grant_date') or extracted_data.get('transaction_date')
                    date_obj = parse_date_safely(date_str)
                    
                    if date_obj and (earliest_date is None or date_obj < earliest_date):
                        earliest_date = date_obj
                        earliest_root = root_node
        
        if earliest_root:
            logger.info(f"Identified Mother Deed by earliest root: {earliest_root.get('name')}")
            return {
                'node_id': earliest_root.get('id'),
                'owner_name': earliest_root.get('name'),
                'identification_method': 'earliest_root_node',
                'date': earliest_date.isoformat() if earliest_date else None
            }
    
    # Strategy 3: No clear Mother Deed found
    logger.warning("Could not identify clear Mother Deed")
    return {
        'node_id': None,
        'owner_name': None,
        'identification_method': 'not_found',
        'warning': 'No clear Mother Deed identified',
        'root_node_count': len(root_nodes)
    }



def detect_ownership_gaps(graph_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Detect gaps in the ownership chain.
    
    Identifies:
    - Missing links (disconnected nodes)
    - Temporal gaps (large time spans between transfers)
    
    Requirements: 7.4
    
    Args:
        graph_data: Graph data structure
        
    Returns:
        List of detected gaps
    """
    logger.info("Detecting ownership gaps")
    
    gaps = []
    nodes = graph_data.get('nodes', [])
    edges = graph_data.get('edges', [])
    
    # Build adjacency lists for graph traversal
    outgoing = defaultdict(list)  # node_id -> list of outgoing edges
    incoming = defaultdict(list)  # node_id -> list of incoming edges
    
    for edge in edges:
        from_node = edge.get('from')
        to_node = edge.get('to')
        outgoing[from_node].append(edge)
        incoming[to_node].append(edge)
    
    # Detect missing links (disconnected components)
    visited = set()
    components = []
    
    for node in nodes:
        node_id = node.get('id')
        if node_id not in visited:
            component = explore_component(node_id, outgoing, incoming, visited)
            components.append(component)
    
    if len(components) > 1:
        # Multiple disconnected components indicate gaps
        logger.warning(f"Found {len(components)} disconnected components")
        gaps.append({
            'type': 'disconnected_chain',
            'severity': 'high',
            'description': f"Ownership chain has {len(components)} disconnected segments",
            'component_count': len(components),
            'components': [list(comp) for comp in components]
        })
    
    # Detect temporal gaps (large time spans)
    for edge in edges:
        time_span = edge.get('time_span_to_next')
        if time_span:
            years = time_span.get('years', 0)
            
            # Flag gaps larger than 5 years
            if years > 5:
                from_node = next((n for n in nodes if n.get('id') == edge.get('from')), None)
                to_node = next((n for n in nodes if n.get('id') == edge.get('to')), None)
                
                gaps.append({
                    'type': 'temporal_gap',
                    'severity': 'medium' if years < 10 else 'high',
                    'description': f"Large time gap of {years} years between transfers",
                    'years': years,
                    'from_owner': from_node.get('name') if from_node else 'Unknown',
                    'to_owner': to_node.get('name') if to_node else 'Unknown',
                    'transaction_date': edge.get('transaction_date')
                })
    
    # Detect nodes with no outgoing edges (except the current owner)
    nodes_with_outgoing = set(edge.get('from') for edge in edges)
    nodes_with_incoming = set(edge.get('to') for edge in edges)
    
    for node in nodes:
        node_id = node.get('id')
        
        # Node has incoming but no outgoing (potential current owner or gap)
        if node_id in nodes_with_incoming and node_id not in nodes_with_outgoing:
            # Check if this is the only such node (current owner)
            terminal_nodes = [n for n in nodes if n.get('id') in nodes_with_incoming and n.get('id') not in nodes_with_outgoing]
            
            if len(terminal_nodes) > 1:
                # Multiple terminal nodes indicate gaps
                gaps.append({
                    'type': 'multiple_terminal_owners',
                    'severity': 'high',
                    'description': f"Multiple potential current owners detected",
                    'terminal_node_count': len(terminal_nodes),
                    'owners': [n.get('name') for n in terminal_nodes]
                })
                break
    
    logger.info(f"Detected {len(gaps)} gaps in ownership chain")
    
    return gaps


def explore_component(
    start_node_id: int,
    outgoing: Dict[int, List[Dict[str, Any]]],
    incoming: Dict[int, List[Dict[str, Any]]],
    visited: Set[int]
) -> Set[int]:
    """
    Explore a connected component in the graph using BFS.
    
    Args:
        start_node_id: Starting node ID
        outgoing: Outgoing edges map
        incoming: Incoming edges map
        visited: Set of visited nodes
        
    Returns:
        Set of node IDs in the component
    """
    component = set()
    queue = deque([start_node_id])
    
    while queue:
        node_id = queue.popleft()
        
        if node_id in visited:
            continue
        
        visited.add(node_id)
        component.add(node_id)
        
        # Add neighbors (both incoming and outgoing)
        for edge in outgoing.get(node_id, []):
            to_node = edge.get('to')
            if to_node not in visited:
                queue.append(to_node)
        
        for edge in incoming.get(node_id, []):
            from_node = edge.get('from')
            if from_node not in visited:
                queue.append(from_node)
    
    return component



def find_all_ownership_paths(graph_data: Dict[str, Any]) -> List[List[int]]:
    """
    Find all ownership paths from Mother Deed to current owner(s).
    
    Handles inheritance splits and merges.
    
    Requirements: 7.6, 7.9
    
    Args:
        graph_data: Graph data structure
        
    Returns:
        List of paths (each path is a list of node IDs)
    """
    logger.info("Finding all ownership paths")
    
    nodes = graph_data.get('nodes', [])
    edges = graph_data.get('edges', [])
    mother_deed = graph_data.get('mother_deed', {})
    
    # Build adjacency list
    adjacency = defaultdict(list)
    for edge in edges:
        from_node = edge.get('from')
        to_node = edge.get('to')
        adjacency[from_node].append(to_node)
    
    # Find root node (Mother Deed)
    root_node_id = mother_deed.get('node_id')
    
    if root_node_id is None:
        # No Mother Deed identified, find root nodes
        nodes_with_incoming = set(edge.get('to') for edge in edges)
        root_nodes = [node.get('id') for node in nodes if node.get('id') not in nodes_with_incoming]
        
        if not root_nodes:
            logger.warning("No root nodes found")
            return []
        
        root_node_id = root_nodes[0]  # Use first root node
    
    # Find terminal nodes (current owners)
    nodes_with_outgoing = set(edge.get('from') for edge in edges)
    terminal_nodes = [node.get('id') for node in nodes if node.get('id') not in nodes_with_outgoing]
    
    if not terminal_nodes:
        logger.warning("No terminal nodes found")
        return []
    
    # Find all paths from root to each terminal node
    all_paths = []
    
    for terminal_node_id in terminal_nodes:
        paths = find_paths_dfs(root_node_id, terminal_node_id, adjacency)
        all_paths.extend(paths)
    
    logger.info(f"Found {len(all_paths)} ownership paths")
    
    return all_paths


def find_paths_dfs(
    start: int,
    end: int,
    adjacency: Dict[int, List[int]],
    path: Optional[List[int]] = None,
    visited: Optional[Set[int]] = None
) -> List[List[int]]:
    """
    Find all paths from start to end using DFS.
    
    Args:
        start: Start node ID
        end: End node ID
        adjacency: Adjacency list
        path: Current path (for recursion)
        visited: Visited nodes (for cycle detection)
        
    Returns:
        List of paths
    """
    if path is None:
        path = []
    if visited is None:
        visited = set()
    
    path = path + [start]
    visited = visited | {start}
    
    if start == end:
        return [path]
    
    paths = []
    for neighbor in adjacency.get(start, []):
        if neighbor not in visited:
            new_paths = find_paths_dfs(neighbor, end, adjacency, path, visited)
            paths.extend(new_paths)
    
    return paths



def detect_circular_ownership(graph_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Detect circular patterns in the ownership graph.
    
    Requirements: 7.7
    
    Args:
        graph_data: Graph data structure
        
    Returns:
        List of detected circular patterns
    """
    logger.info("Detecting circular ownership patterns")
    
    nodes = graph_data.get('nodes', [])
    edges = graph_data.get('edges', [])
    
    # Build adjacency list
    adjacency = defaultdict(list)
    for edge in edges:
        from_node = edge.get('from')
        to_node = edge.get('to')
        adjacency[from_node].append(to_node)
    
    # Detect cycles using DFS
    visited = set()
    rec_stack = set()
    cycles = []
    
    for node in nodes:
        node_id = node.get('id')
        if node_id not in visited:
            cycle = detect_cycle_dfs(node_id, adjacency, visited, rec_stack, [])
            if cycle:
                cycles.append(cycle)
    
    # Format circular patterns
    circular_patterns = []
    
    for cycle in cycles:
        cycle_nodes = [next((n for n in nodes if n.get('id') == node_id), None) for node_id in cycle]
        cycle_names = [n.get('name') for n in cycle_nodes if n]
        
        circular_patterns.append({
            'type': 'circular_ownership',
            'severity': 'critical',
            'description': f"Circular ownership detected involving {len(cycle)} owners",
            'cycle_length': len(cycle),
            'node_ids': cycle,
            'owner_names': cycle_names
        })
    
    if circular_patterns:
        logger.error(f"Detected {len(circular_patterns)} circular ownership patterns")
    else:
        logger.info("No circular ownership patterns detected")
    
    return circular_patterns


def detect_cycle_dfs(
    node_id: int,
    adjacency: Dict[int, List[int]],
    visited: Set[int],
    rec_stack: Set[int],
    path: List[int]
) -> Optional[List[int]]:
    """
    Detect cycle using DFS with recursion stack.
    
    Args:
        node_id: Current node ID
        adjacency: Adjacency list
        visited: Visited nodes
        rec_stack: Recursion stack for cycle detection
        path: Current path
        
    Returns:
        Cycle path if found, None otherwise
    """
    visited.add(node_id)
    rec_stack.add(node_id)
    path = path + [node_id]
    
    for neighbor in adjacency.get(node_id, []):
        if neighbor not in visited:
            cycle = detect_cycle_dfs(neighbor, adjacency, visited, rec_stack, path)
            if cycle:
                return cycle
        elif neighbor in rec_stack:
            # Cycle detected
            cycle_start_index = path.index(neighbor)
            return path[cycle_start_index:]
    
    rec_stack.remove(node_id)
    return None



def store_lineage_graph(property_id: str, graph_data: Dict[str, Any]) -> None:
    """
    Store lineage graph in Lineage table.
    
    Requirements: 7.1
    
    Args:
        property_id: Property ID
        graph_data: Graph data structure
    """
    logger.info(f"Storing lineage graph for property {property_id}")
    
    lineage_table = get_lineage_table()
    
    # Prepare lineage item
    lineage_item = {
        'propertyId': property_id,
        'nodes': graph_data.get('nodes', []),
        'edges': graph_data.get('edges', []),
        'motherDeed': graph_data.get('mother_deed', {}),
        'gaps': graph_data.get('gaps', []),
        'ownershipPaths': graph_data.get('ownership_paths', []),
        'circularPatterns': graph_data.get('circular_patterns', []),
        'metadata': {
            'node_count': len(graph_data.get('nodes', [])),
            'edge_count': len(graph_data.get('edges', [])),
            'gap_count': len(graph_data.get('gaps', [])),
            'path_count': len(graph_data.get('ownership_paths', [])),
            'has_circular_ownership': len(graph_data.get('circular_patterns', [])) > 0
        },
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'updatedAt': datetime.now(timezone.utc).isoformat()
    }
    
    # Store in DynamoDB
    lineage_table.put_item(Item=lineage_item)
    
    logger.info(f"Lineage graph stored successfully for property {property_id}")


def update_property_status(
    property_id: str,
    status: str,
    error_message: Optional[str] = None
) -> None:
    """
    Update property status in Properties table.
    
    Args:
        property_id: Property ID
        status: New status
        error_message: Optional error message
    """
    logger.info(f"Updating property {property_id} status to {status}")
    
    properties_table = get_properties_table()
    
    update_expression = "SET #status = :status, updatedAt = :updated_at"
    expression_values = {
        ':status': status,
        ':updated_at': datetime.now(timezone.utc).isoformat()
    }
    expression_names = {
        '#status': 'status'
    }
    
    if error_message:
        update_expression += ", errorMessage = :error_message"
        expression_values[':error_message'] = error_message
    
    properties_table.update_item(
        Key={'propertyId': property_id},
        UpdateExpression=update_expression,
        ExpressionAttributeValues=expression_values,
        ExpressionAttributeNames=expression_names
    )
    
    logger.info(f"Property status updated successfully")


def update_document_status(
    document_id: str,
    property_id: str,
    status: str,
    error_message: Optional[str] = None
) -> None:
    """
    Update a single document's processingStatus in the Documents table.

    Requirements: 3.4, 3.6

    Args:
        document_id: Document ID (partition key)
        property_id: Property ID (sort key)
        status: New processingStatus value
        error_message: Optional error message
    """
    logger.info(f"Updating document {document_id} status to {status}")

    documents_table = get_documents_table()

    update_expression = "SET processingStatus = :status, updatedAt = :updated_at"
    expression_values = {
        ':status': status,
        ':updated_at': datetime.now(timezone.utc).isoformat()
    }

    if error_message:
        update_expression += ", errorMessage = :error_message"
        expression_values[':error_message'] = error_message

    documents_table.update_item(
        Key={
            'documentId': document_id,
            'propertyId': property_id
        },
        UpdateExpression=update_expression,
        ExpressionAttributeValues=expression_values
    )

    logger.info(f"Document {document_id} status updated to {status}")


def update_all_documents_status(
    property_id: str,
    status: str,
    error_message: Optional[str] = None
) -> None:
    """
    Update processingStatus for all documents belonging to a property,
    then update the property status for backward compatibility.

    Requirements: 3.4, 3.6

    Args:
        property_id: Property ID
        status: New processingStatus value for each document
        error_message: Optional error message
    """
    logger.info(f"Updating all documents for property {property_id} to status {status}")

    documents_table = get_documents_table()

    try:
        response = documents_table.query(
            IndexName='propertyId-uploadedAt-index',
            KeyConditionExpression='propertyId = :property_id',
            ExpressionAttributeValues={
                ':property_id': property_id
            }
        )
        documents = response.get('Items', [])
    except Exception as e:
        logger.error(f"Error querying documents for property {property_id}: {str(e)}", exc_info=True)
        documents = []

    for doc in documents:
        document_id = doc.get('documentId')
        if document_id:
            # Skip permanently failed documents — don't overwrite their failed status
            TERMINAL_FAILED_STATUSES = {'ocr_failed', 'translation_failed', 'analysis_failed'}
            current_status = doc.get('processingStatus', '')
            if current_status in TERMINAL_FAILED_STATUSES and not status.endswith('_failed'):
                logger.debug(f"Skipping status update for permanently failed document {document_id} ({current_status})")
                continue
            try:
                update_document_status(document_id, property_id, status, error_message)
            except Exception as e:
                logger.error(
                    f"Error updating document {document_id} to {status}: {str(e)}",
                    exc_info=True
                )

    # Keep property-level status update for backward compatibility
    update_property_status(property_id, status, error_message)

    logger.info(f"Finished updating {len(documents)} documents for property {property_id} to {status}")
