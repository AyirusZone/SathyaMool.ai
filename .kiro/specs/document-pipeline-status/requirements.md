# Requirements Document

## Introduction

The SatyaMool property document management system processes uploaded documents through a 6-step pipeline: Upload → OCR → Translation → Analysis → Lineage → Scoring. Currently, the property list card shows "Documents 0" even when documents have been uploaded, and document status is stuck at intermediate states (e.g., "in progress" or "OCR Complete") rather than progressing through the full pipeline. This feature fixes the pipeline status tracking so that each document has an accurate per-step progress bar, the property list card shows the correct document count, and a document is only marked "completed" when all 6 pipeline steps have succeeded.

## Glossary

- **Pipeline**: The ordered sequence of 6 processing steps a document must pass through: Upload, OCR, Translation, Analysis, Lineage, Scoring.
- **Pipeline_Step**: One of the 6 discrete stages in the Pipeline: `upload`, `ocr`, `translation`, `analysis`, `lineage`, `scoring`.
- **Document**: A file registered in the SatyaMool-Documents DynamoDB table, identified by `documentId` and `propertyId`.
- **Property**: A real-estate record in the SatyaMool-Properties DynamoDB table, identified by `propertyId`.
- **Processing_Status**: The `processingStatus` string field on a Document record, representing the current Pipeline_Step outcome (e.g., `pending`, `ocr_complete`, `translation_complete`, `analysis_complete`, `lineage_complete`, `scoring_complete`, `failed`).
- **Document_Count**: The count of Document records associated with a Property, stored on the Property record and returned by the list-properties API.
- **Pipeline_Progress**: A per-document data structure that maps each Pipeline_Step to one of three states: `pending`, `in_progress`, or `complete`.
- **Property_Status**: The top-level `status` field on a Property record (`pending`, `processing`, `completed`, `failed`).
- **List_Properties_Lambda**: The AWS Lambda function at `packages/backend/src/properties/list-properties.ts` that returns the property list.
- **Get_Property_Lambda**: The AWS Lambda function at `packages/backend/src/properties/get-property.ts` that returns property details including document pipeline status.
- **Register_Document_Lambda**: The AWS Lambda function at `packages/backend/src/properties/register-document.ts` that registers a newly uploaded document.
- **OCR_Lambda**: The Python Lambda at `packages/processing/ocr/handler.py` that performs OCR and sets `processingStatus` to `ocr_complete`.
- **Translation_Lambda**: The Python Lambda at `packages/processing/translation/handler.py` that translates OCR text and sets `processingStatus` to `translation_complete`.
- **Analysis_Lambda**: The Python Lambda at `packages/processing/analysis/handler.py` that extracts structured data and sets `processingStatus` to `analysis_complete`.
- **Lineage_Lambda**: The Python Lambda at `packages/processing/lineage/handler.py` that builds the ownership lineage graph and sets `processingStatus` to `lineage_complete`.
- **Scoring_Lambda**: The Python Lambda at `packages/processing/trust-score/handler.py` that calculates the trust score and sets `processingStatus` to `scoring_complete`.
- **DocumentUpload_Component**: The React component at `packages/frontend/src/components/DocumentUpload.tsx`.
- **PropertyDetails_Page**: The React page at `packages/frontend/src/pages/PropertyDetails.tsx`.
- **PropertyList_Page**: The React page that renders the property list cards.
- **Property_Service**: The TypeScript service at `packages/frontend/src/services/property.ts`.

---

## Requirements

### Requirement 1: Accurate Document Count on Property List Card

**User Story:** As a user, I want the property list card to show the correct number of uploaded documents, so that I can see at a glance how many documents have been submitted for each property.

#### Acceptance Criteria

1. WHEN the List_Properties_Lambda returns a Property, THE List_Properties_Lambda SHALL include a `documentCount` field equal to the number of Document records associated with that Property in the SatyaMool-Documents table.
2. WHEN a Document is registered via the Register_Document_Lambda, THE Register_Document_Lambda SHALL increment the `documentCount` field on the corresponding Property record in the SatyaMool-Properties table.
3. THE PropertyList_Page SHALL display the `documentCount` value returned by the List_Properties_Lambda for each property card.
4. IF the `documentCount` field is absent from the List_Properties_Lambda response, THEN THE PropertyList_Page SHALL display 0 as the document count.

---

### Requirement 2: Per-Document Pipeline Progress Tracking

**User Story:** As a user, I want to see a progress bar for each uploaded document showing which of the 6 pipeline steps have completed, so that I can understand exactly where each document is in processing.

#### Acceptance Criteria

1. THE Get_Property_Lambda SHALL return a `documents` array where each entry includes a `pipelineProgress` object mapping each Pipeline_Step (`upload`, `ocr`, `translation`, `analysis`, `lineage`, `scoring`) to one of the states: `pending`, `in_progress`, or `complete`.
2. WHEN a Document's `processingStatus` is `pending`, THE Get_Property_Lambda SHALL set `pipelineProgress.upload` to `complete` and all subsequent steps to `pending`.
3. WHEN a Document's `processingStatus` is `ocr_processing`, THE Get_Property_Lambda SHALL set `pipelineProgress.upload` to `complete`, `pipelineProgress.ocr` to `in_progress`, and all subsequent steps to `pending`.
4. WHEN a Document's `processingStatus` is `ocr_complete`, THE Get_Property_Lambda SHALL set `pipelineProgress.upload` and `pipelineProgress.ocr` to `complete`, and all subsequent steps to `pending`.
5. WHEN a Document's `processingStatus` is `translation_complete`, THE Get_Property_Lambda SHALL set `pipelineProgress.upload`, `pipelineProgress.ocr`, and `pipelineProgress.translation` to `complete`, and all subsequent steps to `pending`.
6. WHEN a Document's `processingStatus` is `analysis_complete`, THE Get_Property_Lambda SHALL set `pipelineProgress.upload`, `pipelineProgress.ocr`, `pipelineProgress.translation`, and `pipelineProgress.analysis` to `complete`, and all subsequent steps to `pending`.
7. WHEN a Document's `processingStatus` is `lineage_complete`, THE Get_Property_Lambda SHALL set `pipelineProgress.upload`, `pipelineProgress.ocr`, `pipelineProgress.translation`, `pipelineProgress.analysis`, and `pipelineProgress.lineage` to `complete`, and `pipelineProgress.scoring` to `pending`.
8. WHEN a Document's `processingStatus` is `scoring_complete`, THE Get_Property_Lambda SHALL set all 6 `pipelineProgress` steps to `complete`.
9. WHEN a Document's `processingStatus` ends with `_failed`, THE Get_Property_Lambda SHALL set the corresponding step's `pipelineProgress` state to `failed`.
10. THE PropertyDetails_Page SHALL render a per-document progress bar with 6 labeled steps using the `pipelineProgress` data returned by the Get_Property_Lambda.

---

### Requirement 3: Correct Pipeline Step Status Transitions

**User Story:** As a system operator, I want each processing Lambda to write the correct terminal status for its step, so that the pipeline progresses through all 6 steps without getting stuck.

#### Acceptance Criteria

1. WHEN the OCR_Lambda successfully processes a document, THE OCR_Lambda SHALL set the Document's `processingStatus` to `ocr_complete`.
2. WHEN the Translation_Lambda successfully processes a document, THE Translation_Lambda SHALL set the Document's `processingStatus` to `translation_complete`.
3. WHEN the Analysis_Lambda successfully processes a document, THE Analysis_Lambda SHALL set the Document's `processingStatus` to `analysis_complete`.
4. WHEN the Lineage_Lambda successfully processes all documents for a Property, THE Lineage_Lambda SHALL set each processed Document's `processingStatus` to `lineage_complete`.
5. WHEN the Scoring_Lambda successfully calculates the trust score for a Property, THE Scoring_Lambda SHALL set each Document's `processingStatus` to `scoring_complete`.
6. WHEN any processing Lambda fails to process a document, THE failing Lambda SHALL set the Document's `processingStatus` to the corresponding failure value (`ocr_failed`, `translation_failed`, `analysis_failed`, `lineage_failed`, `scoring_failed`).
7. THE Lineage_Lambda SHALL only begin processing a Property WHEN all Documents for that Property have `processingStatus` equal to `analysis_complete`.
8. THE Scoring_Lambda SHALL only begin processing a Property WHEN the Lineage_Lambda has set all Documents for that Property to `lineage_complete`.

---

### Requirement 4: Property Completion Status

**User Story:** As a user, I want the property status to show "completed" only when all documents have finished all 6 pipeline steps, so that I know the full analysis is ready.

#### Acceptance Criteria

1. WHEN all Documents for a Property have `processingStatus` equal to `scoring_complete`, THE Scoring_Lambda SHALL set the Property's `status` to `completed`.
2. WHILE at least one Document for a Property has a `processingStatus` that is not `scoring_complete` and not a failure value, THE Property's `status` SHALL remain `processing`.
3. IF any Document for a Property has `processingStatus` ending in `_failed` and no retry is pending, THEN THE Scoring_Lambda SHALL set the Property's `status` to `failed`.
4. THE Get_Property_Lambda SHALL derive the Property_Status from the current Document records rather than relying solely on the stored `status` field, to prevent stale status values.

---

### Requirement 5: Document Count Consistency

**User Story:** As a user, I want the document count shown on the property list to always match the actual number of registered documents, so that I am not misled by stale cached data.

#### Acceptance Criteria

1. WHEN the Register_Document_Lambda successfully registers a Document, THE Register_Document_Lambda SHALL perform an atomic increment of the `documentCount` attribute on the Property record using a DynamoDB conditional update.
2. THE List_Properties_Lambda SHALL read the `documentCount` attribute directly from the SatyaMool-Properties table rather than querying the SatyaMool-Documents table, to ensure low-latency responses.
3. WHEN the List_Properties_Lambda cache TTL expires, THE List_Properties_Lambda SHALL re-read the `documentCount` from DynamoDB to reflect any newly registered documents.
4. IF the `documentCount` attribute is missing from a Property record, THEN THE List_Properties_Lambda SHALL return 0 for that property's document count.

---

### Requirement 6: Frontend Pipeline Progress Display

**User Story:** As a user, I want the document list in the property details page to show a visual pipeline progress bar for each file, so that I can track each document's processing state at a glance.

#### Acceptance Criteria

1. THE DocumentUpload_Component SHALL display each uploaded file's pipeline progress using the `pipelineProgress` data from the Property_Service after upload completes.
2. WHEN a document's pipeline step is `complete`, THE PropertyDetails_Page SHALL render that step's indicator in a visually distinct "completed" style (e.g., filled/green).
3. WHEN a document's pipeline step is `in_progress`, THE PropertyDetails_Page SHALL render that step's indicator in a visually distinct "in progress" style (e.g., animated/blue).
4. WHEN a document's pipeline step is `failed`, THE PropertyDetails_Page SHALL render that step's indicator in a visually distinct "failed" style (e.g., red) and display the error reason if available.
5. WHEN a document's pipeline step is `pending`, THE PropertyDetails_Page SHALL render that step's indicator in a neutral "pending" style (e.g., grey/outlined).
6. THE PropertyDetails_Page SHALL poll the Get_Property_Lambda every 10 seconds WHILE any document has a `pipelineProgress` step that is `in_progress`, and SHALL stop polling WHEN all documents have all steps either `complete` or `failed`.

---

### Requirement 7: Pipeline Status API Contract

**User Story:** As a frontend developer, I want a stable API contract for pipeline status data, so that the UI can reliably render progress without defensive coding against missing fields.

#### Acceptance Criteria

1. THE Get_Property_Lambda SHALL always return a `pipelineProgress` object for every Document, even if the Document has never been processed (all steps default to `pending`).
2. THE Get_Property_Lambda SHALL return the `pipelineProgress` object with exactly the keys: `upload`, `ocr`, `translation`, `analysis`, `lineage`, `scoring`.
3. THE Property_Service SHALL expose a `getPipelineProgress(propertyId: string): Promise<DocumentPipelineStatus[]>` method that returns the pipeline progress for all documents of a property.
4. FOR ALL valid `processingStatus` string values, the mapping from `processingStatus` to `pipelineProgress` SHALL be deterministic and produce the same result when applied multiple times (idempotent mapping).
