# SatyaMool Frontend

React 18 frontend application for the SatyaMool property verification platform.

## Features

- **Authentication**: Email/phone login with OTP verification
- **Property Dashboard**: View and manage property verifications
- **Document Upload**: Drag-and-drop bulk upload (up to 50 documents)
- **Processing Status**: Real-time status updates with progress tracking
- **Lineage Graph**: Interactive ownership chain visualization with React Flow
- **Trust Score**: Visual gauge with detailed breakdown
- **PDF Reports**: Download comprehensive verification reports
- **Notifications**: Real-time notification center
- **Admin Panel**: User management and audit logs (Admin only)

## Tech Stack

- React 18 with TypeScript
- Material-UI (MUI) for UI components
- React Router for navigation
- React Flow for graph visualization
- Axios for API calls with auth interceptors
- Vite for build tooling
- Vitest for testing

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

```bash
cd packages/frontend
npm install
```

### Environment Variables

Create a `.env` file:

```
VITE_API_BASE_URL=http://localhost:3000/v1
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## Project Structure

```
src/
├── components/          # Reusable components
│   ├── DocumentUpload.tsx
│   ├── Layout.tsx
│   ├── LineageGraph.tsx
│   ├── ProcessingStatus.tsx
│   ├── ProtectedRoute.tsx
│   ├── TrustScoreBreakdown.tsx
│   └── TrustScoreGauge.tsx
├── pages/              # Page components
│   ├── AdminPanel.tsx
│   ├── Dashboard.tsx
│   ├── Login.tsx
│   ├── PropertyDetails.tsx
│   └── Register.tsx
├── services/           # API services
│   ├── admin.ts
│   ├── api.ts
│   ├── auth.ts
│   ├── notification.ts
│   └── property.ts
├── test/               # Test setup
│   └── setup.ts
├── App.tsx             # Main app component
├── main.tsx            # Entry point
└── theme.ts            # MUI theme configuration
```

## Key Components

### Authentication
- JWT token storage and automatic refresh
- Protected routes with role-based access control
- Phone OTP and email/password authentication

### Document Upload
- Drag-and-drop interface
- File validation (PDF, JPEG, PNG, TIFF, max 50MB)
- Bulk upload up to 50 documents
- Progress tracking per file
- Presigned URL upload to S3

### Lineage Graph
- Interactive node/edge visualization
- Color-coded verification status
- Zoom, pan, and minimap for large graphs
- Click to view details
- Hover tooltips with metadata

### Trust Score
- Visual gauge with color coding
- Expandable breakdown of score components
- Detailed explanations
- Links to source documents

### Processing Status
- Stage-by-stage progress indicator
- Percentage completion
- Auto-refresh every 10 seconds

## API Integration

All API calls go through the centralized `api.ts` service with:
- Automatic JWT token injection
- Token refresh on 401 errors
- Error handling and retry logic
- Request/response interceptors

## Testing

Component tests use Vitest and React Testing Library:

```bash
npm test                 # Run tests
npm test -- --watch     # Watch mode
npm test -- --coverage  # Coverage report
```

## Deployment

The frontend is deployed as a static site to S3 + CloudFront:

1. Build the production bundle: `npm run build`
2. Upload `dist/` to S3 bucket
3. Invalidate CloudFront cache
4. Access via CloudFront URL

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

Private - SatyaMool Platform
