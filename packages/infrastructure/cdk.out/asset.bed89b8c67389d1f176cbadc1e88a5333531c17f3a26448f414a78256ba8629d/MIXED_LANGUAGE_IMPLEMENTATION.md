# Mixed-Language Document Handling Implementation

## Overview

This document describes the implementation of mixed-language document handling for the SatyaMool translation Lambda function, fulfilling **Requirement 5.7**: "WHEN a document contains mixed languages, THE System SHALL translate each section in its detected language."

## Implementation Date

January 2025

## Requirements Addressed

- **Requirement 5.7**: Handle mixed-language documents
  - Detect language per text section
  - Translate each section in its detected language
  - Preserve section boundaries in output

## Architecture

### Components Added

1. **`detect_mixed_language_sections(text, fallback_language)`**
   - Splits document into paragraphs (sections)
   - Detects language for each section using Amazon Comprehend
   - Merges consecutive sections with the same language
   - Returns list of sections with detected languages

2. **`detect_text_language(text, fallback_language)`**
   - Uses Amazon Comprehend's `detect_dominant_language` API
   - Handles long text by truncating to first 1000 characters
   - Falls back to provided language if Comprehend fails
   - Returns ISO 639-1 language code

3. **`merge_consecutive_same_language_sections(sections)`**
   - Merges adjacent sections with the same language
   - Reduces number of translation API calls
   - Maintains context for better translation quality

4. **`translate_mixed_language_document(sections, target_language)`**
   - Translates each section separately
   - Skips translation for sections already in target language
   - Skips translation for unsupported languages
   - Preserves section boundaries with double newlines
   - Returns combined translated text and metadata

5. **`get_comprehend_client()`**
   - Lazy initialization of Amazon Comprehend client
   - Reuses client across invocations

### Modified Components

1. **`process_translation(document_data)`**
   - Now calls `detect_mixed_language_sections()` for all documents
   - Handles both single-language and mixed-language documents
   - Passes fallback language from OCR metadata

## How It Works

### Single-Language Documents

1. Document text is analyzed for paragraph boundaries
2. If only one section is found, treated as single-language
3. Language is detected using Comprehend (with fallback to OCR metadata)
4. Entire document is translated as one unit (existing behavior)

### Mixed-Language Documents

1. Document is split into paragraphs (double newlines or single newlines)
2. Each paragraph's language is detected using Amazon Comprehend
3. Consecutive paragraphs with the same language are merged
4. Each language section is translated separately:
   - Hindi section → Translated to English
   - English section → Kept as-is (no translation)
   - Tamil section → Translated to English
5. Translated sections are combined with double newlines to preserve boundaries
6. Metadata includes:
   - `mixed_language_document`: true
   - `section_count`: number of sections
   - `languages_detected`: list of detected languages
   - Per-section metadata (language, translation status, lengths)

## Example

### Input Document
```
यह हिंदी में पहला पैराग्राफ है।

This is an English paragraph in the middle.

இது தமிழ் பத்தி உள்ளது.
```

### Processing Steps

1. **Section Detection**:
   - Section 1: "यह हिंदी में पहला पैराग्राफ है।" → Hindi (hi)
   - Section 2: "This is an English paragraph in the middle." → English (en)
   - Section 3: "இது தமிழ் பத்தி உள்ளது." → Tamil (ta)

2. **Translation**:
   - Section 1 (Hindi) → Translated to English
   - Section 2 (English) → Kept as-is
   - Section 3 (Tamil) → Translated to English

3. **Output**:
```
This is the first paragraph in Hindi.

This is an English paragraph in the middle.

This is a Tamil paragraph.
```

### Metadata Stored
```json
{
  "mixed_language_document": true,
  "section_count": 3,
  "sections": [
    {
      "section_index": 0,
      "source_language": "hi",
      "target_language": "en",
      "translation_performed": true,
      "original_length": 45,
      "translated_length": 38
    },
    {
      "section_index": 1,
      "source_language": "en",
      "target_language": "en",
      "translation_performed": false,
      "original_length": 44,
      "translated_length": 44
    },
    {
      "section_index": 2,
      "source_language": "ta",
      "target_language": "en",
      "translation_performed": true,
      "original_length": 28,
      "translated_length": 26
    }
  ],
  "languages_detected": ["hi", "en", "ta"],
  "total_characters_original": 117,
  "total_characters_translated": 108
}
```

## AWS Services Used

### Amazon Comprehend
- **API**: `detect_dominant_language`
- **Purpose**: Detect language of text sections
- **Input**: Text string (up to 5000 bytes)
- **Output**: List of detected languages with confidence scores
- **Cost**: $0.0001 per 100 characters (first 50M characters/month)

### Amazon Translate
- **API**: `translate_text`
- **Purpose**: Translate text sections
- **Input**: Text, source language, target language
- **Output**: Translated text
- **Cost**: $15 per million characters

## IAM Permissions Required

The Lambda function requires the following additional IAM permissions:

```json
{
  "Effect": "Allow",
  "Action": [
    "comprehend:DetectDominantLanguage"
  ],
  "Resource": "*"
}
```

## Error Handling

### Comprehend API Failures
- Falls back to language from OCR metadata
- Logs error for monitoring
- Continues processing with fallback language

### Unsupported Languages
- Sections in unsupported languages are kept as-is
- No translation attempted
- Marked in metadata as `translation_performed: false`

### Empty or Very Short Sections
- Sections < 10 characters are skipped during detection
- Prevents noise from affecting language detection

## Performance Considerations

### API Calls
- **Comprehend**: 1 call per paragraph (before merging)
- **Translate**: 1 call per unique language section (after merging)
- **Optimization**: Consecutive same-language sections are merged to reduce calls

### Latency
- **Single-language document**: No additional latency (same as before)
- **Mixed-language document**: 
  - +100-200ms per Comprehend call
  - Translation time depends on number of sections

### Cost Impact
- **Comprehend**: ~$0.0001 per 100 characters analyzed
- **Translate**: Same cost as before (per character translated)
- **Optimization**: Merging sections reduces translation API calls

## Testing

### Unit Tests Added

1. **TestMixedLanguageSectionDetection** (3 tests)
   - Single-language section detection
   - Multiple-language section detection
   - Consecutive same-language section merging

2. **TestMixedLanguageTranslation** (4 tests)
   - Mixed-language document translation
   - Skipping English sections
   - Preserving section boundaries
   - Handling unsupported languages

3. **TestLanguageDetectionWithComprehend** (4 tests)
   - Hindi text detection
   - English text detection
   - Long text handling
   - Error fallback

4. **TestEndToEndMixedLanguageProcessing** (1 test)
   - Complete mixed-language processing flow

### Test Coverage
- All new functions have unit tests
- Integration test covers end-to-end flow
- Mocked AWS services for reliable testing

## Monitoring

### CloudWatch Metrics to Monitor
- Comprehend API call count
- Comprehend API errors
- Mixed-language document count
- Average sections per document

### CloudWatch Logs
- Language detection results per section
- Section count and languages detected
- Translation decisions (translate vs skip)

## Future Enhancements

1. **Caching**: Cache language detection results for common phrases
2. **Batch Processing**: Batch multiple Comprehend calls for better performance
3. **Custom Language Models**: Train custom models for legal terminology
4. **Section Boundary Detection**: Improve section detection using NLP techniques
5. **Confidence Thresholds**: Add configurable thresholds for language detection confidence

## References

- [Amazon Comprehend Documentation](https://docs.aws.amazon.com/comprehend/)
- [Amazon Translate Documentation](https://docs.aws.amazon.com/translate/)
- [SatyaMool Requirements Document](.kiro/specs/satya-mool/requirements.md)
- [SatyaMool Design Document](.kiro/specs/satya-mool/design.md)
