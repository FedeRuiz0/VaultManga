from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
import redis
import os
import json
from datetime import datetime
from werkzeug.utils import secure_filename

from services.recommendation import RecommendationEngine
from services.ocr_translation import OCRTranslationService

app = Flask(__name__)
CORS(app)

# Configuration
DATABASE_URL = os.environ.get('DATABASE_URL', 
    'postgresql://mangavault:mangavault_password@localhost:5432/mangavault')
REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379')

# Initialize services
recommendation_engine = None
ocr_service = None

def get_db_connection():
    """Get database connection"""
    return psycopg2.connect(DATABASE_URL)

def get_redis_client():
    """Get Redis client"""
    return redis.from_url(REDIS_URL)

# Health check
@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'services': {
            'recommendation': recommendation_engine is not None,
            'ocr': ocr_service is not None
        }
    })

# Initialize AI services
@app.route('/init', methods=['POST'])
def init_services():
    global recommendation_engine, ocr_service
    
    try:
        # Initialize recommendation engine
        recommendation_engine = RecommendationEngine()
        
        # Initialize OCR service (lazy load)
        # ocr_service = OCRTranslationService()  # Uncomment when needed (heavy)
        
        return jsonify({
            'success': True,
            'message': 'AI services initialized'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ==================== RECOMMENDATION SYSTEM ====================

@app.route('/api/recommendations', methods=['GET'])
def get_recommendations():
    """Get personalized manga recommendations for a user"""
    user_id = request.args.get('user_id')
    limit = int(request.args.get('limit', 10))
    
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    
    try:
        if recommendation_engine is None:
            return jsonify({'error': 'Recommendation engine not initialized'}), 503
        
        recommendations = recommendation_engine.get_recommendations(user_id, limit)
        return jsonify(recommendations)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/recommendations/seed', methods=['POST'])
def seed_recommendations():
    """Seed recommendation data from user history"""
    user_id = request.json.get('user_id')
    
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    
    try:
        if recommendation_engine is None:
            return jsonify({'error': 'Recommendation engine not initialized'}), 503
        
        result = recommendation_engine.seed_from_history(user_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/recommendations/similar', methods=['GET'])
def get_similar_manga():
    """Find similar manga based on a given manga"""
    manga_id = request.args.get('manga_id')
    limit = int(request.args.get('limit', 5))
    
    if not manga_id:
        return jsonify({'error': 'manga_id is required'}), 400
    
    try:
        if recommendation_engine is None:
            return jsonify({'error': 'Recommendation engine not initialized'}), 503
        
        similar = recommendation_engine.find_similar(manga_id, limit)
        return jsonify(similar)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== OCR + TRANSLATION ====================

@app.route('/api/ocr/translate', methods=['POST'])
def ocr_translate():
    """Perform OCR and translation on a manga page"""
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
    
    image_file = request.files['image']
    target_lang = request.form.get('target_lang', 'en')
    
    try:
        if ocr_service is None:
            ocr_service = OCRTranslationService()
        
        result = ocr_service.process_image(image_file, target_lang)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/ocr/translate_url', methods=['POST'])
def ocr_translate_url():
    """Perform OCR and translation on an image URL"""
    image_url = request.json.get('image_url')
    target_lang = request.json.get('target_lang', 'en')
    
    if not image_url:
        return jsonify({'error': 'image_url is required'}), 400
    
    try:
        if ocr_service is None:
            ocr_service = OCRTranslationService()
        
        result = ocr_service.process_image_url(image_url, target_lang)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== ANALYTICS ====================

@app.route('/api/analytics/genre-preference', methods=['GET'])
def get_genre_preference():
    """Analyze user's genre preferences from reading history"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get genres from user's reading history
        cur.execute("""
            SELECT m.genre, COUNT(*) as read_count
            FROM reading_sessions rs
            JOIN manga m ON rs.manga_id = m.id
            WHERE rs.user_id = %s
            GROUP BY m.genre
            ORDER BY read_count DESC
        """, (user_id,))
        
        results = cur.fetchall()
        cur.close()
        conn.close()
        
        # Flatten and count genres
        genre_counts = {}
        for row in results:
            genres = row[0] or []
            count = row[1]
            for genre in genres:
                genre_counts[genre] = genre_counts.get(genre, 0) + count
        
        # Sort by count
        sorted_genres = sorted(genre_counts.items(), key=lambda x: x[1], reverse=True)
        
        total = sum(genre_counts.values())
        preferences = [
            {
                'genre': genre,
                'count': count,
                'percentage': round(count / total * 100, 1) if total > 0 else 0
            }
            for genre, count in sorted_genres[:10]
        ]
        
        return jsonify({
            'user_id': user_id,
            'preferences': preferences,
            'total_reads': total
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/analytics/reading-patterns', methods=['GET'])
def get_reading_patterns():
    """Analyze user's reading patterns"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get reading sessions
        cur.execute("""
            SELECT 
                EXTRACT(HOUR FROM started_at) as hour,
                COUNT(*) as sessions,
                AVG(duration_seconds) as avg_duration
            FROM reading_sessions
            WHERE user_id = %s AND ended_at IS NOT NULL
            GROUP BY EXTRACT(HOUR FROM started_at)
            ORDER BY hour
        """, (user_id,))
        
        hourly_patterns = cur.fetchall()
        
        # Get daily patterns
        cur.execute("""
            SELECT 
                EXTRACT(DOW FROM started_at) as day,
                COUNT(*) as sessions
            FROM reading_sessions
            WHERE user_id = %s
            GROUP BY EXTRACT(DOW FROM started_at)
            ORDER BY day
        """, (user_id,))
        
        daily_patterns = cur.fetchall()
        
        cur.close()
        conn.close()
        
        return jsonify({
            'user_id': user_id,
            'hourly': [
                {'hour': int(row[0]), 'sessions': row[1], 'avg_duration': float(row[2] or 0)}
                for row in hourly_patterns
            ],
            'daily': [
                {'day': int(row[0]), 'sessions': row[1]}
                for row in daily_patterns
            ]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

