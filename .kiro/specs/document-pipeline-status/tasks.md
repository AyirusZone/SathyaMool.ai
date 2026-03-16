# Implementation Plan: Document Pipeline Status

## Overview

Fix end-to-end pipeline status tracking for property documents. The work spans three layers: backend Lambda functions (TypeScript + Python), and the React frontend. Tasks are ordered so each step builds on the previous and nothing is left unintegrated.

## Tasks

- [x] 1. Add atomic documentCount increment in register-document.ts
  - Import `UpdateCommand` from `@aws-sdk/lib-dynamodb` in `packages/backend/src/properties/register-document.ts`
  - After the `conditionalPut` succeeds (new document path only), send an `UpdateCommand` with `UpdateExpression: 'ADD documentCount :one'` and `ExpressionAttributeValues: { ':one': 1 }` targeting the Properties table key `{ propertyId }`
  - Wrap the update in a retry loop (up to 3 attempts) and log a CloudWatch error if all retries fail; do not change the 201 response to the caller
  - _Requirements: 1.2, 5.1_

  - [ ]* 1.1 Write property test for documentCount increment
    - **Property 1: Document registration increments count**
    - Generate a random initial `documentCount` (0–1000) and a valid registration payload; mock DynamoDB; verify count after registration equals initial + 1
    - Verify duplicate registration (conditionalPut returns false) does NOT increment the count
    - **Validates: Requirements 1.1, 1.2, 5.1**

- [x] 2. Replace calculateProcessingStatus with mapToPipelineProgress in get-property.ts
  - In `packages/backend/src/properties/get-property.ts`, add a `mapToPipelineProgress(processingStatus: string): PipelineProgress` function implementing the full 14-row mapping table from the design doc (including unknown status defaulting to all-pending)
  - Add `PipelineStepStatus` and `PipelineProgress` TypeScript types locally in the file
  - Update the `handler` to build a `documents` array by mapping each queried document to `{ documentId, fileName, fileSize, processingStatus, uploadedAt, pipelineProgress }`
  - Add a `derivePropertyStatus(documents: any[]): string` function: returns `completed` when all docs are `scoring_complete`, `failed` when any doc has a `_failed` status and none are in-progress, otherwise `processing` (or `pending` if no docs)
  - Replace the stored `property.status` in the response with the derived status
  - Remove the old `calculateProcessingStatus` function and the `processingStatus` percentage field from the response
  - _Requirements: 2.1–2.9, 4.4, 7.1, 7.2_

  - [ ]* 2.1 Write property test for pipelineProgress structural completeness
    - **Property 2: pipelineProgress is always structurally complete**
    - Generate arbitrary strings as `processingStatus`; verify returned object always has exactly keys `upload, ocr, translation, analysis, lineage, scoring` each with value in `{pending, in_progress, complete, failed}`
    - **Validates: Requirements 2.1, 7.1, 7.2**

  - [ ]* 2.2 Write property test for mapping determinism and idempotence
    - **Property 3: processingStatus → pipelineProgress mapping is deterministic and idempotent**
    - Generate random `processingStatus` strings; apply `mapToPipelineProgress` twice; assert deep equality of both results
    - Also verify each known status row matches the exact expected output from the design doc mapping table
    - **Validates: Requirements 2.2–2.9, 7.4**

  - [ ]* 2.3 Write property test for derived property status
    - **Property 8: property status is derived from document states**
    - Generate random arrays of documents with random `processingStatus` values; verify `derivePropertyStatus` returns `completed` iff all are `scoring_complete`, `failed` iff any end in `_failed` and none are in-progress, else `processing`
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

  - [ ]* 2.4 Write property test for missing documentCount defaulting to zero
    - **Property 9: missing documentCount defaults to zero**
    - Generate property records with and without `documentCount`; verify the response always returns a number (0 when absent)
    - **Validates: Requirements 1.4, 5.4**

- [x] 3. Checkpoint — backend unit tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update Lineage Lambda to write per-document lineage_complete status
  - In `packages/processing/lineage/handler.py`, add a guard at the top of the property-processing path: query all documents for the property and check that every document has `processingStatus == 'analysis_complete'`; if not, log at INFO and return without processing
  - After successful lineage graph construction, loop over all documents for the property and call `update_document_status(document_id, property_id, 'lineage_complete')` for each
  - On failure, call `update_document_status(document_id, property_id, 'lineage_failed', error_message)` for each affected document
  - _Requirements: 3.4, 3.6, 3.7_

  - [ ]* 4.1 Write property test for Lineage guard condition
    - **Property 6: Lineage Lambda only processes when all documents are analysis_complete**
    - Use Hypothesis; generate random lists of documents with mixed `processingStatus` values; mock DynamoDB; verify the Lambda skips processing (no UpdateItem calls) when any document is not `analysis_complete`
    - **Validates: Requirements 3.7**

  - [ ]* 4.2 Write property test for Lineage terminal status writes
    - **Property 4 (Lineage): successful Lambda processing sets correct terminal status**
    - Generate random document payloads where all are `analysis_complete`; mock AWS clients; verify each document receives `UpdateItem` with `processingStatus = lineage_complete` on success and `lineage_failed` on exception
    - **Validates: Requirements 3.4, 3.6**

- [x] 5. Update Scoring Lambda to write per-document scoring_complete and set property completed
  - In `packages/processing/trust-score/handler.py`, add a guard: query all documents for the property and check that every document has `processingStatus == 'lineage_complete'`; if not, log at INFO and return without processing
  - After successful trust score calculation, loop over all documents and call `update_document_status(document_id, property_id, 'scoring_complete')` for each; if any update fails, log the failure, continue updating remaining documents, and set property status to `failed`
  - When all documents are successfully updated to `scoring_complete`, call the existing property status update with `status = 'completed'`
  - On scoring failure, set each document to `scoring_failed` and property status to `failed`
  - _Requirements: 3.5, 3.6, 3.8, 4.1, 4.3_

  - [ ]* 5.1 Write property test for Scoring guard condition
    - **Property 7: Scoring Lambda only processes when all documents are lineage_complete**
    - Use Hypothesis; generate random lists of documents with mixed `processingStatus` values; mock DynamoDB; verify the Lambda skips processing when any document is not `lineage_complete`
    - **Validates: Requirements 3.8**

  - [ ]* 5.2 Write property test for Scoring terminal status writes
    - **Property 4 (Scoring) & Property 5: successful/failed Lambda processing sets correct terminal status**
    - Generate random document payloads where all are `lineage_complete`; mock AWS clients; verify each document receives `scoring_complete` on success and `scoring_failed` on exception; verify property status is set to `completed` or `failed` accordingly
    - **Validates: Requirements 3.5, 3.6, 4.1, 4.3**

- [x] 6. Checkpoint — processing Lambda tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Add PipelineStepStatus, PipelineProgress, DocumentWithPipeline types and getPipelineProgress to property.ts
  - In `packages/frontend/src/services/property.ts`, add:
    - `export type PipelineStepStatus = 'pending' | 'in_progress' | 'complete' | 'failed'`
    - `export interface PipelineProgress { upload: PipelineStepStatus; ocr: PipelineStepStatus; translation: PipelineStepStatus; analysis: PipelineStepStatus; lineage: PipelineStepStatus; scoring: PipelineStepStatus; }`
    - `export interface DocumentWithPipeline extends Document { pipelineProgress: PipelineProgress; }`
  - Update the `getProperty` return type to include `documents: DocumentWithPipeline[]` in the `Property` interface (or a new `PropertyWithDocuments` interface used by `getProperty`)
  - Add `async getPipelineProgress(propertyId: string): Promise<DocumentWithPipeline[]>` that calls `getProperty` and returns the `documents` array
  - _Requirements: 7.3_

- [x] 8. Create DocumentPipelineProgress.tsx component
  - Create `packages/frontend/src/components/DocumentPipelineProgress.tsx`
  - Accept props: `document: DocumentWithPipeline`
  - Render a horizontal MUI `Stepper` with 6 steps labeled: Upload, OCR, Translation, Analysis, Lineage, Scoring
  - For each step, map `pipelineProgress[step]` to a visual state:
    - `complete` → green filled icon (CheckCircle)
    - `in_progress` → blue animated icon (CircularProgress, size 20)
    - `failed` → red icon (Error) with a tooltip showing the step name + " failed"
    - `pending` → grey outlined icon (RadioButtonUnchecked)
  - Display the document `fileName` as a label above the stepper
  - _Requirements: 6.2, 6.3, 6.4, 6.5_

  - [ ]* 8.1 Write property test for visual state matching
    - **Property 11: pipeline step visual state matches pipelineProgress value**
    - Use fast-check; generate random `PipelineStepStatus` values for each of the 6 steps; render `DocumentPipelineProgress` with React Testing Library; verify each step's rendered icon/class matches the expected visual state
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5**

- [x] 9. Update PropertyDetails.tsx to use documents array and DocumentPipelineProgress
  - In `packages/frontend/src/pages/PropertyDetails.tsx`:
    - Update `getProperty` call to use the new `Property` type that includes `documents: DocumentWithPipeline[]`
    - In the Documents tab (tab index 1), render a `DocumentPipelineProgress` component for each entry in `property.documents` (import the new component)
    - Replace the existing polling condition: instead of checking `property.status !== 'completed'`, compute `hasActiveSteps` by checking whether any document has any `pipelineProgress` step equal to `in_progress`; poll every 10s while `hasActiveSteps` is true
    - Stop polling when all documents have all 6 steps in `complete` or `failed` (no `in_progress` or `pending` steps remain)
    - Track consecutive poll failures; after 3 consecutive failures, clear the interval and set an error state
    - _Requirements: 6.1, 6.6_

  - [ ]* 9.1 Write property test for polling stop condition
    - **Property 10: frontend polling stops when all steps are terminal**
    - Use fast-check; generate random `PipelineProgress` objects where all 6 steps are `complete` or `failed`; render `PropertyDetails` with mocked `propertyService.getProperty`; verify `setInterval` is not called (or is cleared) after the first render cycle
    - **Validates: Requirements 6.6**

- [x] 10. Final checkpoint — all tests pass, components integrated
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Property tests use fast-check (TypeScript) and Hypothesis (Python); minimum 100 iterations each
- Each property test references the property number from the design doc for traceability
- The `list-properties.ts` file requires no changes — the fix is upstream in `register-document.ts`
- The `DocumentPipelineProgress` component is rendered inside the existing Documents tab in `PropertyDetails`, not as a separate tab
