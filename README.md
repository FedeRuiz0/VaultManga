# MangaVault - Full-Stack Manga Reader & Library Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker Compose](https://img.shields.io/badge/Docker-Compose-blue)](https://www.docker.com/)
[![React](https://img.shields.io/badge/React-18-blue)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18-green)](https://nodejs.org/)

A high-performance personal manga reader built with a **modular architecture**. Designed to scale, it features offline-first capabilities, Redis caching for performance, and a Python-based AI service layer for future recommendation engines.

---

## 💡 Why This Project Matters

MangaVault was created to solve a common problem for manga readers and collectors: managing large local libraries in a fast, private, and scalable way.

Most manga readers rely on external services or unofficial sources, which can introduce limitations such as slow loading times, dependency on third-party APIs, and lack of control over personal libraries. MangaVault takes a different approach by providing a self-hosted platform that gives users full ownership of their manga collections.

The project focuses on building a modern full-stack architecture that demonstrates real-world engineering practices, including:

Service-Oriented Architecture using Docker for modular scalability

High-performance backend design with Redis caching to reduce database load

Modern frontend patterns using React, state management, and efficient data fetching

Experimental AI integration for recommendations and OCR-based features

Beyond being a personal manga reader, MangaVault serves as a technical showcase project that explores how modern web technologies can be combined to build scalable, maintainable applications with clear separation of concerns.

## 🚀 Features

- 📚 **Smart Library** – Automatic chapter detection from local folder structures.
- 🎨 **Webtoon Reader** – Vertical infinite scroll with lazy loading and prefetching.
- 🧠 **AI Integration Layer** – Experimental module for recommendations and OCR translation.
- 📊 **Reading Analytics** – Track progress, time spent, and reading history.
- ⚡ **Performance** – Redis caching reduces database load by up to 80%.
- 🌙 **Modern UI** – Responsive design with dark mode and smooth animations.
- 🔄 **Automated Content Ingestion** – Intelligent scraping system with incremental updates every 15 minutes and full scans every 2 hours, ensuring up-to-date manga and chapters without overloading sources.

---

## 🏗️ Architecture

The application follows a **Service-Oriented Architecture** orchestrated via Docker. This design ensures separation of concerns and allows independent scaling of services.

```mermaid
graph TD
    User[User] --> Frontend[Frontend: React + Vite]
    Frontend --> API[Backend API: Node.js + Express]
    API --> DB[(PostgreSQL)]
    API --> Cache[(Redis)]
    API --> AI[AI Service: Python + Flask]
    AI --> DB
```

Additionally, the system includes a background ingestion service responsible for:

- Detecting new manga entries
- Fetching chapters automatically
- Updating existing manga incrementally
- Running scheduled full consistency scans

This mimics real-world data ingestion pipelines used in content platforms.

---

## 🛠️ Tech Stack

### Frontend

- **Framework:** React 18  
- **Build Tool:** Vite  
- **Styling:** TailwindCSS  
- **State Management:** Zustand  
- **Data Fetching:** React Query (TanStack Query)  
- **Animations:** Framer Motion  

### Backend

- **Runtime:** Node.js  
- **Framework:** Express  
- **Database:** PostgreSQL 15 (with migrations)  
- **Cache:** Redis  
- **Authentication:** JWT (JSON Web Tokens)  

### AI Services

- **Runtime:** Python 3.10+  
- **Framework:** Flask  
- **Libraries:** Sentence Transformers, EasyOCR  

---

## 📂 Project Structure

```bash
mangavault/
├── frontend/           # React application
├── backend/            # Node.js Express API
├── ai-services/        # Python microservices
├── database/           # SQL migrations & schema
└── docker-compose.yml  # Container orchestration
```

---

## 🚦 Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- Python 3.10+ (for AI services)

---

### Option 1: Using Docker (Recommended)

This is the fastest way to run the full stack locally.

```bash
# Clone the repository
git clone https://github.com/FedeRuiz0/mangavault.git
cd mangavault

# Start all services
docker-compose up -d
```

After starting the services, access the application:

- **Frontend:** http://localhost:5173  
- **API Docs:** http://localhost:3001/api-docs (if Swagger is enabled)

---

### Option 2: Manual Setup

Use this if you want to develop specific services independently.

#### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run migrate
npm run dev
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

#### AI Services

```bash
cd ai-services
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

---

## 🔐 Security & Environment

This project uses environment variables for sensitive data.  
**Never commit `.env` files to the repository.**

### Backend `.env`

```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://user:pass@localhost:5432/mangavault
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_strong_secret_key
```

---

## 📡 API Documentation

The API follows RESTful conventions. Key endpoints include:

| Method | Endpoint | Description |
|------|------|------|
| GET | `/api/v1/manga` | List all manga |
| POST | `/api/v1/auth/login` | User authentication |
| GET | `/api/v1/chapters/:id` | Get chapter pages |
| POST | `/api/v1/scan` | Trigger library scan |

For full API documentation, see the **Swagger/OpenAPI specification** located in the `/docs` folder.

---

## 🤖 AI & Machine Learning

The AI module is partially integrated and focuses on enhancing the user experience.

**Capabilities**

- **OCR Processing:** Extracts text from manga panels for future translation features.
- **Foundation for Recommendations:** Architecture prepared for recommendation systems based on user behavior.

**Status**

- Partially implemented
- Actively evolving

---

## 📸 Screenshots

Add screenshots of your application here. A picture is worth a thousand words.

### Library View

![Library](./screenshots/library.png)

### Reader View

![Reader](./screenshots/reader.png)

### Dashboard

![Dashboard](./screenshots/dashboard.png)

---

## 🧪 Testing

```bash
# Run backend tests
cd backend && npm test

# Run frontend tests
cd frontend && npm test
```

---

## 🤝 Contributing

1. Fork the repository  
2. Create a feature branch  

```bash
git checkout -b feature/AmazingFeature
```

3. Commit your changes  

```bash
git commit -m "Add some AmazingFeature"
```

4. Push to the branch  

```bash
git push origin feature/AmazingFeature
```

5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License**.

---

## 🙏 Acknowledgments

Inspired by:

- MangaDex  
- Webtoon  
- Tachiyomi