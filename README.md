# Chat Web Room

A real-time chat application built with vanilla HTML, CSS, JavaScript, Node.js, Express.js, and Socket.io.

## Features

- User registration and authentication with JWT
- Real-time chat rooms
- User presence tracking
- Message history
- Responsive design

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript (vanilla)
- **Backend**: Node.js, Express.js
- **Real-time**: Socket.io
- **Authentication**: JWT (JSON Web Tokens)
- **Database**: Configurable (SQL or NoSQL)

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env` file and configure your environment variables:
   ```bash
   cp .env.example .env
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:3000`

## Project Structure

```
chat-web-room/
├── client/                 # Frontend files
│   ├── index.html         # Main HTML file
│   ├── styles/            # CSS files
│   └── js/                # JavaScript modules
├── server/                # Backend files
│   ├── server.js          # Main server file
│   ├── routes/            # API routes
│   ├── middleware/        # Express middleware
│   ├── models/            # Data models
│   └── controllers/       # Route controllers
├── package.json
└── README.md
```

## Development

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests

## License

MIT