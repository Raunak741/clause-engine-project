**Clause-to-Conclusion Engine**
This project is an AI-powered document analysis tool that processes large, unstructured documents (like insurance policies) and answers natural language queries about them. It leverages a Large Language Model (LLM) to understand the user's question, find relevant clauses in the document, and generate a structured, justified decision.

## Features
Document Upload: Accepts PDF documents or direct text input.

Natural Language Queries: Ask questions in plain English (e.g., "Is knee surgery covered for a 46-year-old with a 3-month policy?").

AI-Powered Analysis: Uses Google's Gemini API to perform semantic understanding and logical reasoning based on the document's content.

Structured JSON Output: Returns a clear, machine-readable JSON object containing the decision, justification, and supporting clauses.

Clause-Level Justification: Pinpoints the exact text from the source document that was used to make the decision, ensuring transparency and auditability.

## Tech Stack
Frontend: React.js

Build Tool: Vite

Styling: Tailwind CSS

AI/LLM: Google Gemini API

PDF Parsing: pdf.js

## Getting Started
Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

Prerequisites
Node.js (which includes npm) installed on your system.

Git installed on your system.

A Google AI API Key. You can get one for free from Google AI Studio.

Installation
Clone the repository:
Open your terminal and run the following command to clone your project from GitHub.

git clone https://github.com/your-username/clause-engine-project.git

(Replace your-username and clause-engine-project with your actual GitHub details)

Navigate to the project directory:

cd clause-engine-project

Install NPM packages:
This command will download all the necessary dependencies for the project.

npm install

Set up your API Key:
This is the most important step for the application to work.

Open the file src/App.jsx.

Find the line that says const apiKey = "";.

Paste your Google AI API key inside the quotation marks.

// src/App.jsx
const apiKey = "AIzaSyB...your...long...api...key...here"; 

Running the Application
Start the development server:

npm run dev

Open the application in your browser:
Navigate to http://localhost:5173 (or the URL provided in your terminal).

usage How to Use
Upload a Document: Click "Choose File" to select a PDF document from your computer, or paste the text content directly into the text area.

Ask a Question: Type your query into the input box.

Get Decision: Click the "Get Decision" button to start the analysis.

View Results: The application will display the decision, the amount payable (if any), a detailed justification, and the specific clauses from the document that support the conclusion.
