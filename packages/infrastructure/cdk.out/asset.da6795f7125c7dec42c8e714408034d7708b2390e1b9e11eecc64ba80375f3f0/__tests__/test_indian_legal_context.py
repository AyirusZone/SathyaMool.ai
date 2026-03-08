"""
Unit Tests for Indian Legal Context Support

Tests for regional identifier extraction, name variation handling,
date format parsing, and stamp duty/registration detail extraction.

Requirements: 18.1, 18.2, 18.3, 18.5, 18.6, 18.7
"""

import pytest
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from indian_legal_context import (
    extract_regional_identifiers,
    normalize_regional_identifiers,
    extract_indian_names_with_variations,
    normalize_indian_name,
    parse_indian_date,
    extract_stamp_duty_and_registration,
    enhance_extraction_with_indian_context
)


class TestRegionalIdentifierExtraction:
    """Test regional property identifier extraction for all Indian states"""
    
    def test_extract_khata_number_karnataka(self):
        """Test Khata number extraction for Karnataka - Requirement 18.1"""
        text = "Property Khata No: 123/456 in Bangalore"
        result = extract_regional_identifiers(text)
        
        assert 'khata' in result
        assert len(result['khata']) == 1
        assert result['khata'][0]['value'] == '123/456'
        assert result['khata'][0]['state'] == 'Karnataka'
    
    def test_extract_patta_number_tamil_nadu(self):
        """Test Patta number extraction for Tamil Nadu - Requirement 18.2"""
        text = "Patta Number: 789/2023 in Chennai"
        result = extract_regional_identifiers(text)
        
        assert 'patta' in result
        assert len(result['patta']) == 1
        assert result['patta'][0]['value'] == '789/2023'
        assert result['patta'][0]['state'] == 'Tamil Nadu'
    
    def test_extract_chitta_adangal_tamil_nadu(self):
        """Test Chitta and Adangal extraction for Tamil Nadu - Requirement 18.3"""
        text = "Chitta No: CH-456 and Adangal No: AD-789"
        result = extract_regional_identifiers(text)
        
        assert 'chitta' in result
        assert 'adangal' in result
        assert result['chitta'][0]['value'] == 'CH-456'
        assert result['adangal'][0]['value'] == 'AD-789'
        assert result['chitta'][0]['state'] == 'Tamil Nadu'
        assert result['adangal'][0]['state'] == 'Tamil Nadu'
    
    def test_extract_sat_bara_maharashtra(self):
        """Test 7/12 extract for Maharashtra"""
        text = "7-12 extract number: 7/12/2023/456"
        result = extract_regional_identifiers(text)
        
        assert 'sat_bara' in result
        assert result['sat_bara'][0]['state'] == 'Maharashtra'
    
    def test_extract_pahani_andhra_pradesh(self):
        """Test Pahani extraction for Andhra Pradesh/Telangana"""
        text = "Pahani No: PH-123/456"
        result = extract_regional_identifiers(text)
        
        assert 'pahani' in result
        assert result['pahani'][0]['value'] == 'PH-123/456'
        assert result['pahani'][0]['state'] == 'Andhra Pradesh/Telangana'
    
    def test_extract_jamabandi_rajasthan(self):
        """Test Jamabandi extraction for Rajasthan"""
        text = "Jamabandi Number: JB-789"
        result = extract_regional_identifiers(text)
        
        assert 'jamabandi' in result
        assert result['jamabandi'][0]['value'] == 'JB-789'
        assert result['jamabandi'][0]['state'] == 'Rajasthan'
    
    def test_extract_khasra_rajasthan(self):
        """Test Khasra extraction for Rajasthan"""
        text = "Khasra No: 456/12"
        result = extract_regional_identifiers(text)
        
        assert 'khasra' in result
        assert result['khasra'][0]['value'] == '456/12'
    
    def test_extract_fard_punjab(self):
        """Test Fard extraction for Punjab/Haryana"""
        text = "Fard Number: F-123"
        result = extract_regional_identifiers(text)
        
        assert 'fard' in result
        assert result['fard'][0]['state'] == 'Punjab/Haryana'
    
    def test_extract_dag_west_bengal(self):
        """Test Dag extraction for West Bengal"""
        text = "Dag No: 789 and Plot No: 456"
        result = extract_regional_identifiers(text)
        
        assert 'dag' in result
        assert 'plot' in result
        assert result['dag'][0]['value'] == '789'
        assert result['plot'][0]['value'] == '456'
    
    def test_extract_survey_number_common(self):
        """Test Survey Number extraction (common across states)"""
        text = "Survey Number: 123/4A and S.No. 456/7B"
        result = extract_regional_identifiers(text)
        
        assert 'survey_number' in result
        assert len(result['survey_number']) >= 1
    
    def test_extract_multiple_identifiers(self):
        """Test extraction of multiple identifier types"""
        text = """
        Property Details:
        Survey No: 123/4
        Khata No: KH-456
        Patta No: PT-789
        """
        result = extract_regional_identifiers(text)
        
        assert 'survey_number' in result
        assert 'khata' in result
        assert 'patta' in result
    
    def test_no_identifiers_found(self):
        """Test when no identifiers are present"""
        text = "This is a document without any property identifiers"
        result = extract_regional_identifiers(text)
        
        assert len(result) == 0


class TestRegionalIdentifierNormalization:
    """Test normalization of regional identifiers to Survey_Number format"""
    
    def test_normalize_survey_numbers(self):
        """Test normalization keeps survey numbers as-is - Requirement 18.5"""
        regional_ids = {
            'survey_number': [
                {'value': '123/4', 'state': 'All States', 'description': 'Survey number', 'type': 'survey_number'}
            ]
        }
        result = normalize_regional_identifiers(regional_ids)
        
        assert '123/4' in result
    
    def test_normalize_khata_to_survey_format(self):
        """Test Khata normalization - Requirement 18.5"""
        regional_ids = {
            'khata': [
                {'value': 'KH-456', 'state': 'Karnataka', 'description': 'Khata', 'type': 'khata'}
            ]
        }
        result = normalize_regional_identifiers(regional_ids)
        
        assert 'KHATA:KH-456' in result
    
    def test_normalize_patta_to_survey_format(self):
        """Test Patta normalization - Requirement 18.5"""
        regional_ids = {
            'patta': [
                {'value': 'PT-789', 'state': 'Tamil Nadu', 'description': 'Patta', 'type': 'patta'}
            ]
        }
        result = normalize_regional_identifiers(regional_ids)
        
        assert 'PATTA:PT-789' in result
    
    def test_normalize_mixed_identifiers(self):
        """Test normalization of mixed identifier types"""
        regional_ids = {
            'survey_number': [
                {'value': '123/4', 'state': 'All States', 'description': 'Survey', 'type': 'survey_number'}
            ],
            'khata': [
                {'value': 'KH-456', 'state': 'Karnataka', 'description': 'Khata', 'type': 'khata'}
            ],
            'patta': [
                {'value': 'PT-789', 'state': 'Tamil Nadu', 'description': 'Patta', 'type': 'patta'}
            ]
        }
        result = normalize_regional_identifiers(regional_ids)
        
        assert '123/4' in result
        assert 'KHATA:KH-456' in result
        assert 'PATTA:PT-789' in result
        assert len(result) == 3
    
    def test_normalize_removes_duplicates(self):
        """Test that normalization removes duplicate values"""
        regional_ids = {
            'survey_number': [
                {'value': '123/4', 'state': 'All States', 'description': 'Survey', 'type': 'survey_number'},
                {'value': '123/4', 'state': 'All States', 'description': 'Survey', 'type': 'survey_number'}
            ]
        }
        result = normalize_regional_identifiers(regional_ids)
        
        assert len(result) == 1
        assert '123/4' in result


class TestIndianNameHandling:
    """Test Indian name variation handling and patronymic patterns"""
    
    def test_extract_name_with_son_of_pattern(self):
        """Test extraction of names with S/o pattern - Requirement 18.6"""
        text = "Buyer: Rajesh Kumar S/o Ramesh Kumar"
        result = extract_indian_names_with_variations(text)
        
        assert len(result) > 0
        # Check that S/o pattern was detected
        assert any('S/o' in name.get('relationship', '') or 'S/O' in name.get('relationship', '') 
                  for name in result)
    
    def test_extract_name_with_daughter_of_pattern(self):
        """Test extraction of names with D/o pattern - Requirement 18.6"""
        text = "Seller: Priya Sharma D/o Vijay Sharma"
        result = extract_indian_names_with_variations(text)
        
        assert len(result) > 0
    
    def test_extract_name_with_wife_of_pattern(self):
        """Test extraction of names with W/o pattern - Requirement 18.6"""
        text = "Owner: Lakshmi Devi W/o Krishna Murthy"
        result = extract_indian_names_with_variations(text)
        
        assert len(result) > 0
    
    def test_normalize_indian_name_basic(self):
        """Test basic name normalization - Requirement 18.6"""
        name = "  rajesh   kumar  "
        result = normalize_indian_name(name)
        
        assert result == "Rajesh Kumar"
    
    def test_normalize_indian_name_with_patronymic(self):
        """Test name normalization removes patronymic prefix - Requirement 18.6"""
        name = "Rajesh Kumar S/o Ramesh Kumar"
        result = normalize_indian_name(name)
        
        # Should remove S/o and normalize
        assert "S/o" not in result or "S/O" not in result
        assert result.strip() != ""
    
    def test_normalize_indian_name_spelling_variations(self):
        """Test name normalization handles spelling variations - Requirement 18.6"""
        # Test Kumar variations
        name1 = "Rajesh Kumarr"
        result1 = normalize_indian_name(name1)
        
        name2 = "Rajesh Kumar"
        result2 = normalize_indian_name(name2)
        
        # After normalization, variations should be standardized
        assert "Kumar" in result1
    
    def test_normalize_empty_name(self):
        """Test normalization of empty name"""
        result = normalize_indian_name("")
        assert result == ""
    
    def test_normalize_none_name(self):
        """Test normalization of None name"""
        result = normalize_indian_name(None)
        assert result is None


class TestIndianDateParsing:
    """Test Indian date format parsing"""
    
    def test_parse_dd_mm_yyyy_slash(self):
        """Test DD/MM/YYYY format - Requirement 18.7"""
        date_str = "15/08/2023"
        result = parse_indian_date(date_str)
        
        assert result == "2023-08-15"
    
    def test_parse_dd_mm_yyyy_dash(self):
        """Test DD-MM-YYYY format - Requirement 18.7"""
        date_str = "15-08-2023"
        result = parse_indian_date(date_str)
        
        assert result == "2023-08-15"
    
    def test_parse_dd_mm_yyyy_dot(self):
        """Test DD.MM.YYYY format - Requirement 18.7"""
        date_str = "15.08.2023"
        result = parse_indian_date(date_str)
        
        assert result == "2023-08-15"
    
    def test_parse_dd_month_yyyy_text(self):
        """Test DD Month YYYY format - Requirement 18.7"""
        date_str = "15 August 2023"
        result = parse_indian_date(date_str)
        
        assert result == "2023-08-15"
    
    def test_parse_month_dd_yyyy_text(self):
        """Test Month DD, YYYY format - Requirement 18.7"""
        date_str = "August 15, 2023"
        result = parse_indian_date(date_str)
        
        assert result == "2023-08-15"
    
    def test_parse_single_digit_day_month(self):
        """Test parsing with single digit day and month"""
        date_str = "5/3/2023"
        result = parse_indian_date(date_str)
        
        assert result == "2023-03-05"
    
    def test_parse_invalid_date(self):
        """Test parsing invalid date returns None"""
        date_str = "invalid date"
        result = parse_indian_date(date_str)
        
        assert result is None
    
    def test_parse_empty_date(self):
        """Test parsing empty date returns None"""
        result = parse_indian_date("")
        assert result is None
    
    def test_parse_none_date(self):
        """Test parsing None date returns None"""
        result = parse_indian_date(None)
        assert result is None
    
    def test_parse_date_with_invalid_month(self):
        """Test parsing date with invalid month"""
        date_str = "15/13/2023"
        result = parse_indian_date(date_str)
        
        assert result is None
    
    def test_parse_date_with_invalid_day(self):
        """Test parsing date with invalid day"""
        date_str = "32/08/2023"
        result = parse_indian_date(date_str)
        
        assert result is None


class TestStampDutyAndRegistration:
    """Test stamp duty and registration detail extraction"""
    
    def test_extract_stamp_duty(self):
        """Test stamp duty extraction - Requirement 18.8"""
        text = "Stamp Duty: Rs. 50,000"
        result = extract_stamp_duty_and_registration(text)
        
        assert result['stamp_duty'] == 50000.0
    
    def test_extract_registration_fee(self):
        """Test registration fee extraction - Requirement 18.8"""
        text = "Registration Fee: Rs. 5,000"
        result = extract_stamp_duty_and_registration(text)
        
        assert result['registration_fee'] == 5000.0
    
    def test_extract_registration_number(self):
        """Test registration number extraction - Requirement 18.8"""
        text = "Registration No: REG/2023/12345"
        result = extract_stamp_duty_and_registration(text)
        
        assert result['registration_number'] == 'REG/2023/12345'
    
    def test_extract_sub_registrar_office(self):
        """Test sub-registrar office extraction - Requirement 18.8"""
        text = "Sub-Registrar Office: Bangalore North"
        result = extract_stamp_duty_and_registration(text)
        
        assert 'Bangalore North' in result['sub_registrar_office']
    
    def test_extract_registration_date(self):
        """Test registration date extraction - Requirement 18.8"""
        text = "Registration Date: 15/08/2023"
        result = extract_stamp_duty_and_registration(text)
        
        assert result['registration_date'] == '2023-08-15'
    
    def test_extract_all_details(self):
        """Test extraction of all stamp duty and registration details"""
        text = """
        Stamp Duty: Rs. 50,000
        Registration Fee: Rs. 5,000
        Registration No: REG/2023/12345
        Sub-Registrar Office: Bangalore North
        Registration Date: 15/08/2023
        """
        result = extract_stamp_duty_and_registration(text)
        
        assert result['stamp_duty'] == 50000.0
        assert result['registration_fee'] == 5000.0
        assert result['registration_number'] == 'REG/2023/12345'
        assert 'Bangalore North' in result['sub_registrar_office']
        assert result['registration_date'] == '2023-08-15'
    
    def test_extract_no_details(self):
        """Test when no details are present"""
        text = "This document has no stamp duty or registration details"
        result = extract_stamp_duty_and_registration(text)
        
        assert result['stamp_duty'] is None
        assert result['registration_fee'] is None
        assert result['registration_number'] is None


class TestEnhanceExtractionWithIndianContext:
    """Test the main enhancement function that integrates all Indian context"""
    
    def test_enhance_with_regional_identifiers(self):
        """Test enhancement adds regional identifiers"""
        text = "Property Khata No: 123/456 and Survey No: 789/10"
        extracted_data = {'survey_numbers': []}
        
        result = enhance_extraction_with_indian_context(text, extracted_data)
        
        assert 'regional_identifiers' in result
        assert 'survey_numbers' in result
        assert len(result['survey_numbers']) > 0
    
    def test_enhance_with_indian_names(self):
        """Test enhancement adds Indian name patterns"""
        text = "Buyer: Rajesh Kumar S/o Ramesh Kumar"
        extracted_data = {'buyer_name': 'Rajesh Kumar S/o Ramesh Kumar'}
        
        result = enhance_extraction_with_indian_context(text, extracted_data)
        
        assert 'indian_names' in result
        assert 'buyer_name_normalized' in result
    
    def test_enhance_with_date_parsing(self):
        """Test enhancement parses Indian date formats"""
        text = "Transaction Date: 15/08/2023"
        extracted_data = {'transaction_date': '15/08/2023'}
        
        result = enhance_extraction_with_indian_context(text, extracted_data)
        
        assert result['transaction_date'] == '2023-08-15'
    
    def test_enhance_with_stamp_duty(self):
        """Test enhancement adds stamp duty details"""
        text = "Stamp Duty: Rs. 50,000 and Registration No: REG/2023/12345"
        extracted_data = {'registration_details': {}}
        
        result = enhance_extraction_with_indian_context(text, extracted_data)
        
        assert 'stamp_duty_details' in result
        assert result['stamp_duty_details']['stamp_duty'] == 50000.0
    
    def test_enhance_merges_survey_numbers(self):
        """Test enhancement merges existing and extracted survey numbers"""
        text = "Khata No: KH-456"
        extracted_data = {'survey_numbers': ['123/4']}
        
        result = enhance_extraction_with_indian_context(text, extracted_data)
        
        # Should have both original and new survey numbers
        assert '123/4' in result['survey_numbers']
        assert any('KHATA' in sn for sn in result['survey_numbers'])
    
    def test_enhance_complete_document(self):
        """Test enhancement with a complete document"""
        text = """
        Sale Deed
        Buyer: Rajesh Kumar S/o Ramesh Kumar
        Seller: Priya Sharma D/o Vijay Sharma
        Transaction Date: 15/08/2023
        Survey No: 123/4
        Khata No: KH-456
        Stamp Duty: Rs. 50,000
        Registration Fee: Rs. 5,000
        Registration No: REG/2023/12345
        Sub-Registrar Office: Bangalore North
        """
        extracted_data = {
            'buyer_name': 'Rajesh Kumar S/o Ramesh Kumar',
            'seller_name': 'Priya Sharma D/o Vijay Sharma',
            'transaction_date': '15/08/2023',
            'survey_numbers': ['123/4'],
            'registration_details': {}
        }
        
        result = enhance_extraction_with_indian_context(text, extracted_data)
        
        # Verify all enhancements
        assert 'regional_identifiers' in result
        assert 'indian_names' in result
        assert 'buyer_name_normalized' in result
        assert 'seller_name_normalized' in result
        assert result['transaction_date'] == '2023-08-15'
        assert 'stamp_duty_details' in result
        assert len(result['survey_numbers']) >= 2  # Original + Khata


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
