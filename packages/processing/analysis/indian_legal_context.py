"""
Indian Legal Context Support Module

This module provides utilities for handling India-specific legal document formats,
including regional property identifiers, name variations, date formats, and
stamp duty/registration details.

Requirements: 18.1, 18.2, 18.3, 18.5, 18.6, 18.7, 18.8
"""

import re
from typing import Dict, List, Optional, Any
from datetime import datetime
import logging

logger = logging.getLogger()


# Regional property identifier patterns for all Indian states
REGIONAL_IDENTIFIERS = {
    # Karnataka
    'khata': {
        'patterns': [
            r'khata\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
            r'khatha\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Karnataka',
        'description': 'Property tax record'
    },
    
    # Tamil Nadu
    'patta': {
        'patterns': [
            r'patta\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
            r'pattas?\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Tamil Nadu',
        'description': 'Land ownership document'
    },
    'chitta': {
        'patterns': [
            r'chitta\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
            r'chit(?:t)?a\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Tamil Nadu',
        'description': 'Land record extract'
    },
    'adangal': {
        'patterns': [
            r'adangal\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
            r'adangals?\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Tamil Nadu',
        'description': 'Village administrative officer record'
    },
    
    # Andhra Pradesh & Telangana
    'pahani': {
        'patterns': [
            r'pahani\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
            r'pahanis?\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Andhra Pradesh/Telangana',
        'description': 'Land record'
    },
    'ror': {
        'patterns': [
            r'ROR\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
            r'record\s+of\s+rights?\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Andhra Pradesh/Telangana',
        'description': 'Record of Rights'
    },
    
    # Maharashtra
    'sat_bara': {
        'patterns': [
            r'7[\s\-]?12\s*(?:extract)?[\s:]*([A-Z0-9\-/]+)',
            r'sat[\s\-]?bara\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
            r'satbara\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Maharashtra',
        'description': '7/12 land record extract'
    },
    'property_card': {
        'patterns': [
            r'property\s+card\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Maharashtra',
        'description': 'Property card'
    },
    
    # Gujarat
    'form_6': {
        'patterns': [
            r'form[\s\-]?6\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Gujarat',
        'description': 'Form 6 land record'
    },
    'form_7_12': {
        'patterns': [
            r'form[\s\-]?7[\s\-]?12\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Gujarat',
        'description': 'Form 7/12 land record'
    },
    
    # Rajasthan
    'jamabandi': {
        'patterns': [
            r'jamabandi\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
            r'jamabandis?\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Rajasthan',
        'description': 'Land ownership record'
    },
    'khasra': {
        'patterns': [
            r'khasra\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
            r'khasras?\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Rajasthan',
        'description': 'Field/plot number'
    },
    
    # Uttar Pradesh & Madhya Pradesh
    'khatoni': {
        'patterns': [
            r'khatoni\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
            r'khatonis?\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Uttar Pradesh/Madhya Pradesh',
        'description': 'Land record'
    },
    'khatauni': {
        'patterns': [
            r'khatauni\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
            r'khataunis?\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Uttar Pradesh/Madhya Pradesh',
        'description': 'Land ownership record'
    },
    
    # Punjab & Haryana
    'fard': {
        'patterns': [
            r'fard\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
            r'fards?\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Punjab/Haryana',
        'description': 'Land record'
    },
    'jamabandi_punjab': {
        'patterns': [
            r'jamabandi\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Punjab/Haryana',
        'description': 'Land ownership record'
    },
    
    # West Bengal
    'plot': {
        'patterns': [
            r'plot\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
            r'plots?\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'West Bengal',
        'description': 'Plot number'
    },
    'dag': {
        'patterns': [
            r'dag\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
            r'dags?\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'West Bengal',
        'description': 'Land parcel number'
    },
    
    # Kerala
    'resurvey': {
        'patterns': [
            r're[\s\-]?survey\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Kerala',
        'description': 'Re-survey number'
    },
    'block': {
        'patterns': [
            r'block\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Kerala',
        'description': 'Block number'
    },
    
    # Odisha
    'khata_odisha': {
        'patterns': [
            r'khata\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Odisha',
        'description': 'Land record'
    },
    'plot_odisha': {
        'patterns': [
            r'plot\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'Odisha',
        'description': 'Plot number'
    },
    
    # Common across states
    'survey_number': {
        'patterns': [
            r'survey\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
            r'sy\.?\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
            r's\.?\s*no\.?\s*([A-Z0-9\-/]+)',
        ],
        'state': 'All States',
        'description': 'Survey number'
    },
    'revenue_survey': {
        'patterns': [
            r'revenue\s+survey\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
            r'r\.?\s*s\.?\s*(?:no|number|#)?[\s:]*([A-Z0-9\-/]+)',
        ],
        'state': 'All States',
        'description': 'Revenue survey number'
    },
}


# Indian name patronymic patterns
PATRONYMIC_PATTERNS = [
    r'S/[Oo]\.?\s+',  # Son of
    r'D/[Oo]\.?\s+',  # Daughter of
    r'W/[Oo]\.?\s+',  # Wife of
    r'H/[Oo]\.?\s+',  # Husband of
    r'C/[Oo]\.?\s+',  # Care of
    r'son\s+of\s+',
    r'daughter\s+of\s+',
    r'wife\s+of\s+',
    r'husband\s+of\s+',
]


# Indian date format patterns
DATE_PATTERNS = [
    # DD/MM/YYYY or DD-MM-YYYY
    (r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})', 'dmy'),
    # DD.MM.YYYY
    (r'(\d{1,2})\.(\d{1,2})\.(\d{4})', 'dmy'),
    # DD Month YYYY (e.g., 15 January 2020)
    (r'(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})', 'dmy_text'),
    # Month DD, YYYY (e.g., January 15, 2020)
    (r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})', 'mdy_text'),
]

MONTH_NAMES = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4,
    'may': 5, 'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12
}


def extract_regional_identifiers(text: str) -> Dict[str, List[Dict[str, Any]]]:
    """
    Extract regional property identifiers from document text.
    
    Extracts Khata, Patta, Chitta, Adangal, and other state-specific identifiers
    for all Indian states.
    
    Requirements: 18.1, 18.2, 18.3
    
    Args:
        text: Document text
        
    Returns:
        Dictionary mapping identifier types to lists of extracted values with metadata
    """
    logger.info("Extracting regional property identifiers")
    
    extracted = {}
    text_upper = text.upper()
    
    for identifier_type, config in REGIONAL_IDENTIFIERS.items():
        matches = []
        
        for pattern in config['patterns']:
            # Search case-insensitively
            for match in re.finditer(pattern, text, re.IGNORECASE):
                value = match.group(1).strip()
                if value and len(value) > 0:
                    matches.append({
                        'value': value,
                        'state': config['state'],
                        'description': config['description'],
                        'type': identifier_type
                    })
        
        if matches:
            # Remove duplicates while preserving order
            seen = set()
            unique_matches = []
            for match in matches:
                if match['value'] not in seen:
                    seen.add(match['value'])
                    unique_matches.append(match)
            
            extracted[identifier_type] = unique_matches
    
    logger.info(f"Extracted {len(extracted)} types of regional identifiers")
    
    return extracted


def normalize_regional_identifiers(
    regional_identifiers: Dict[str, List[Dict[str, Any]]]
) -> List[str]:
    """
    Normalize regional identifiers to standard Survey_Number format.
    
    Requirements: 18.5
    
    Args:
        regional_identifiers: Dictionary of extracted regional identifiers
        
    Returns:
        List of normalized survey numbers
    """
    logger.info("Normalizing regional identifiers to Survey_Number format")
    
    normalized = []
    
    for identifier_type, matches in regional_identifiers.items():
        for match in matches:
            # For survey_number and revenue_survey, use as-is
            if identifier_type in ['survey_number', 'revenue_survey']:
                normalized.append(match['value'])
            else:
                # For other regional identifiers, prefix with type
                # e.g., "KHATA:123/456" or "PATTA:789"
                normalized.append(f"{identifier_type.upper()}:{match['value']}")
    
    # Remove duplicates
    normalized = list(set(normalized))
    
    logger.info(f"Normalized {len(normalized)} identifiers")
    
    return normalized


def extract_indian_names_with_variations(text: str) -> List[Dict[str, Any]]:
    """
    Extract Indian names with patronymic patterns and handle spelling variations.
    
    Handles patterns like S/o, D/o, W/o and common spelling variations.
    
    Requirements: 18.6
    
    Args:
        text: Document text
        
    Returns:
        List of extracted names with metadata
    """
    logger.info("Extracting Indian names with variations")
    
    names = []
    
    # Extract names with patronymic patterns
    for pattern in PATRONYMIC_PATTERNS:
        # Find all occurrences of patronymic patterns
        matches = re.finditer(pattern, text, re.IGNORECASE)
        
        for match in matches:
            # Extract context around the match (up to 100 characters before and after)
            start = max(0, match.start() - 100)
            end = min(len(text), match.end() + 100)
            context = text[start:end]
            
            # Try to extract the full name (person and parent)
            # This is a simplified extraction - in production, you'd use NER
            words_before = text[start:match.start()].split()
            words_after = text[match.end():end].split()
            
            if words_before and words_after:
                # Get last 2-3 words before pattern as person name
                person_name = ' '.join(words_before[-3:]).strip()
                # Get first 2-3 words after pattern as parent name
                parent_name = ' '.join(words_after[:3]).strip()
                
                names.append({
                    'person_name': person_name,
                    'parent_name': parent_name,
                    'relationship': match.group(0).strip(),
                    'full_text': f"{person_name} {match.group(0)} {parent_name}"
                })
    
    logger.info(f"Extracted {len(names)} names with patronymic patterns")
    
    return names


def normalize_indian_name(name: str) -> str:
    """
    Normalize Indian name by handling common spelling variations.
    
    Requirements: 18.6
    
    Args:
        name: Name to normalize
        
    Returns:
        Normalized name
    """
    if not name:
        return name
    
    # Remove extra whitespace
    normalized = ' '.join(name.split())
    
    # Remove patronymic prefixes for comparison
    for pattern in PATRONYMIC_PATTERNS:
        normalized = re.sub(pattern, '', normalized, flags=re.IGNORECASE)
    
    # Convert to title case
    normalized = normalized.title()
    
    # Common spelling variations (add more as needed)
    variations = {
        'Kumar': ['Kumarr', 'Kumaar'],
        'Krishna': ['Krshna', 'Krsna'],
        'Lakshmi': ['Laxmi', 'Lakshimi'],
        'Venkata': ['Venkat', 'Venkate'],
    }
    
    for standard, variants in variations.items():
        for variant in variants:
            normalized = re.sub(r'\b' + variant + r'\b', standard, normalized, flags=re.IGNORECASE)
    
    return normalized.strip()


def parse_indian_date(date_str: str) -> Optional[str]:
    """
    Parse Indian date formats and convert to ISO 8601 format.
    
    Handles DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, and text month formats.
    
    Requirements: 18.7
    
    Args:
        date_str: Date string in Indian format
        
    Returns:
        ISO 8601 formatted date (YYYY-MM-DD) or None if parsing fails
    """
    if not date_str:
        return None
    
    date_str = date_str.strip()
    
    for pattern, format_type in DATE_PATTERNS:
        match = re.search(pattern, date_str, re.IGNORECASE)
        if match:
            try:
                if format_type == 'dmy':
                    day, month, year = match.groups()
                    day = int(day)
                    month = int(month)
                    year = int(year)
                    
                elif format_type == 'dmy_text':
                    day, month_name, year = match.groups()
                    day = int(day)
                    month = MONTH_NAMES.get(month_name.lower())
                    year = int(year)
                    
                elif format_type == 'mdy_text':
                    month_name, day, year = match.groups()
                    day = int(day)
                    month = MONTH_NAMES.get(month_name.lower())
                    year = int(year)
                
                # Validate date components
                if month and 1 <= month <= 12 and 1 <= day <= 31 and 1900 <= year <= 2100:
                    # Create date object and format as ISO 8601
                    date_obj = datetime(year, month, day)
                    return date_obj.strftime('%Y-%m-%d')
                    
            except (ValueError, TypeError) as e:
                logger.debug(f"Failed to parse date '{date_str}': {str(e)}")
                continue
    
    logger.debug(f"Could not parse date: {date_str}")
    return None


def extract_stamp_duty_and_registration(text: str) -> Dict[str, Any]:
    """
    Extract stamp duty and registration details from document text.
    
    Handles state-specific registration formats.
    
    Requirements: 18.8
    
    Args:
        text: Document text
        
    Returns:
        Dictionary with stamp duty and registration details
    """
    logger.info("Extracting stamp duty and registration details")
    
    details = {
        'stamp_duty': None,
        'registration_fee': None,
        'registration_number': None,
        'registration_date': None,
        'sub_registrar_office': None,
        'document_number': None,
    }
    
    # Extract stamp duty amount
    stamp_patterns = [
        r'stamp\s+duty[\s:]+(?:Rs\.?|INR)?\s*([0-9,]+(?:\.\d{2})?)',
        r'stamp\s+duty\s+paid[\s:]+(?:Rs\.?|INR)?\s*([0-9,]+(?:\.\d{2})?)',
        r'duty\s+paid[\s:]+(?:Rs\.?|INR)?\s*([0-9,]+(?:\.\d{2})?)',
    ]
    
    for pattern in stamp_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            amount = match.group(1).replace(',', '')
            details['stamp_duty'] = float(amount)
            break
    
    # Extract registration fee
    reg_fee_patterns = [
        r'registration\s+fee[\s:]+(?:Rs\.?|INR)?\s*([0-9,]+(?:\.\d{2})?)',
        r'registration\s+charges[\s:]+(?:Rs\.?|INR)?\s*([0-9,]+(?:\.\d{2})?)',
    ]
    
    for pattern in reg_fee_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            amount = match.group(1).replace(',', '')
            details['registration_fee'] = float(amount)
            break
    
    # Extract registration number
    reg_num_patterns = [
        r'registration\s+(?:no|number)[\s:]+([A-Z0-9\-/]+)',
        r'reg\.?\s+(?:no|number)[\s:]+([A-Z0-9\-/]+)',
        r'document\s+(?:no|number)[\s:]+([A-Z0-9\-/]+)',
        r'doc\.?\s+(?:no|number)[\s:]+([A-Z0-9\-/]+)',
    ]
    
    for pattern in reg_num_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            details['registration_number'] = match.group(1).strip()
            break
    
    # Extract sub-registrar office
    office_patterns = [
        r'sub[\s\-]?registrar[\s\-]?office[\s:]+([A-Za-z\s,]+?)(?:\n|\.|$)',
        r'sub[\s\-]?registrar[\s:]+([A-Za-z\s,]+?)(?:\n|\.|$)',
        r'registered\s+at[\s:]+([A-Za-z\s,]+?)(?:\n|\.|$)',
    ]
    
    for pattern in office_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            details['sub_registrar_office'] = match.group(1).strip()
            break
    
    # Extract registration date
    reg_date_patterns = [
        r'registration\s+date[\s:]+([0-9]{1,2}[/\-\.][0-9]{1,2}[/\-\.][0-9]{4})',
        r'registered\s+on[\s:]+([0-9]{1,2}[/\-\.][0-9]{1,2}[/\-\.][0-9]{4})',
        r'date\s+of\s+registration[\s:]+([0-9]{1,2}[/\-\.][0-9]{1,2}[/\-\.][0-9]{4})',
    ]
    
    for pattern in reg_date_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            parsed_date = parse_indian_date(date_str)
            if parsed_date:
                details['registration_date'] = parsed_date
            break
    
    logger.info(f"Extracted stamp duty and registration details: {details}")
    
    return details


def enhance_extraction_with_indian_context(
    text: str,
    extracted_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Enhance extracted data with Indian legal context.
    
    This is the main function that integrates all Indian context extraction.
    
    Requirements: 18.1, 18.2, 18.3, 18.5, 18.6, 18.7, 18.8
    
    Args:
        text: Document text
        extracted_data: Base extracted data from Bedrock
        
    Returns:
        Enhanced extracted data with Indian context
    """
    logger.info("Enhancing extraction with Indian legal context")
    
    # Extract regional identifiers
    regional_identifiers = extract_regional_identifiers(text)
    extracted_data['regional_identifiers'] = regional_identifiers
    
    # Normalize to survey numbers
    normalized_survey_numbers = normalize_regional_identifiers(regional_identifiers)
    
    # Merge with existing survey numbers
    existing_survey_numbers = extracted_data.get('survey_numbers', [])
    if existing_survey_numbers:
        all_survey_numbers = list(set(existing_survey_numbers + normalized_survey_numbers))
    else:
        all_survey_numbers = normalized_survey_numbers
    
    extracted_data['survey_numbers'] = all_survey_numbers
    
    # Extract names with patronymic patterns
    indian_names = extract_indian_names_with_variations(text)
    extracted_data['indian_names'] = indian_names
    
    # Normalize existing names
    if 'buyer_name' in extracted_data and extracted_data['buyer_name']:
        extracted_data['buyer_name_normalized'] = normalize_indian_name(extracted_data['buyer_name'])
    
    if 'seller_name' in extracted_data and extracted_data['seller_name']:
        extracted_data['seller_name_normalized'] = normalize_indian_name(extracted_data['seller_name'])
    
    if 'original_owner_name' in extracted_data and extracted_data['original_owner_name']:
        extracted_data['original_owner_name_normalized'] = normalize_indian_name(
            extracted_data['original_owner_name']
        )
    
    # Parse Indian date formats
    date_fields = ['transaction_date', 'grant_date', 'issue_date']
    for field in date_fields:
        if field in extracted_data and extracted_data[field]:
            # If date is not already in ISO format, try to parse it
            date_value = extracted_data[field]
            if isinstance(date_value, str) and not re.match(r'\d{4}-\d{2}-\d{2}', date_value):
                parsed_date = parse_indian_date(date_value)
                if parsed_date:
                    extracted_data[field] = parsed_date
    
    # Extract stamp duty and registration details
    stamp_duty_details = extract_stamp_duty_and_registration(text)
    extracted_data['stamp_duty_details'] = stamp_duty_details
    
    # Merge with existing registration details
    if 'registration_details' not in extracted_data:
        extracted_data['registration_details'] = {}
    
    for key, value in stamp_duty_details.items():
        if value is not None:
            # Map to registration_details structure
            if key == 'registration_number':
                extracted_data['registration_details']['registration_number'] = value
            elif key == 'registration_date':
                extracted_data['registration_details']['registration_date'] = value
            elif key == 'sub_registrar_office':
                extracted_data['registration_details']['sub_registrar_office'] = value
    
    logger.info("Successfully enhanced extraction with Indian legal context")
    
    return extracted_data
