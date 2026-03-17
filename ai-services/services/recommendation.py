import numpy as np
import psycopg2
import redis
import os
from datetime import datetime
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer
import pickle

class RecommendationEngine:
    def __init__(self):
        self.model = None
        self.manga_embeddings = {}
        self.redis_client = None
        self._init_redis()
        
    def _init_redis(self):
        """Initialize Redis connection"""
        try:
            redis_url = os.environ.get('REDIS_URL', 'redis://localhost:6379')
            self.redis_client = redis.from_url(redis_url)
        except Exception as e:
            print(f"Redis connection failed: {e}")
    
    def _get_db_connection(self):
        """Get database connection"""
        db_url = os.environ.get('DATABASE_URL', 
            'postgresql://mangavault:mangavault_password@localhost:5432/mangavault')
        return psycopg2.connect(db_url)
    
    def _load_model(self):
        """Load sentence transformer model lazily"""
        if self.model is None:
            print("Loading sentence transformer model...")
            self.model = SentenceTransformer('all-MiniLM-L6-v2')
            print("Model loaded successfully")
        return self.model
    
    def get_manga_text(self, manga):
        """Convert manga metadata to text for embedding"""
        parts = [
            manga.get('title', ''),
            ' '.join(manga.get('alt_titles', [])),
            manga.get('description', ''),
            manga.get('author', ''),
            ' '.join(manga.get('genre', []))
        ]
        return ' '.join(filter(None, parts))
    
    def generate_embedding(self, text):
        """Generate embedding for text"""
        model = self._load_model()
        return model.encode(text)
    
    def seed_from_history(self, user_id):
        """Seed recommendation data from user's reading history"""
        conn = self._get_db_connection()
        cur = conn.cursor()
        
        try:
            # Get user's reading history with manga details
            cur.execute("""
                SELECT DISTINCT m.id, m.title, m.alt_titles, m.description, 
                       m.genre, m.author, m.artist
                FROM reading_sessions rs
                JOIN manga m ON rs.manga_id = m.id
                WHERE rs.user_id = %s
                ORDER BY rs.started_at DESC
                LIMIT 100
            """, (user_id,))
            
            history = cur.fetchall()
            
            if not history:
                return {'success': True, 'message': 'No reading history found'}
            
            # Get user's favorite genres
            genre_counts = {}
            for row in history:
                genres = row[5] or []  # genre is at index 5
                for genre in genres:
                    genre_counts[genre] = genre_counts.get(genre, 0) + 1
            
            # Get preferred authors
            author_counts = {}
            for row in history:
                if row[6]:  # author
                    author_counts[row[6]] = author_counts.get(row[6], 0) + 1
            
            # Calculate user profile
            top_genres = sorted(genre_counts.items(), key=lambda x: x[1], reverse=True)[:5]
            top_authors = sorted(author_counts.items(), key=lambda x: x[1], reverse=True)[:3]
            
            user_profile = {
                'preferred_genres': [g[0] for g in top_genres],
                'preferred_authors': [a[0] for a in top_authors],
                'history_count': len(history)
            }
            
            # Cache user profile
            if self.redis_client:
                self.redis_client.setex(
                    f'user_profile:{user_id}',
                    86400,  # 24 hours
                    str(user_profile)
                )
            
            return {
                'success': True,
                'user_profile': user_profile,
                'history_count': len(history)
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            cur.close()
            conn.close()
    
    def get_recommendations(self, user_id, limit=10):
        """Get personalized recommendations for a user"""
        conn = self._get_db_connection()
        cur = conn.cursor()
        
        try:
            # Get user profile from cache
            user_profile = None
            if self.redis_client:
                profile_data = self.redis_client.get(f'user_profile:{user_id}')
                if profile_data:
                    user_profile = eval(profile_data)
            
            # If no cached profile, generate one
            if not user_profile:
                self.seed_from_history(user_id)
                if self.redis_client:
                    profile_data = self.redis_client.get(f'user_profile:{user_id}')
                    if profile_data:
                        user_profile = eval(profile_data)
            
            # Get all manga not yet read by user
            cur.execute("""
                SELECT m.id, m.title, m.alt_titles, m.description, 
                       m.genre, m.author, m.artist, m.cover_image
                FROM manga m
                WHERE m.id NOT IN (
                    SELECT DISTINCT manga_id 
                    FROM reading_sessions 
                    WHERE user_id = %s
                )
                ORDER BY m.last_read_at DESC NULLS LAST
                LIMIT 200
            """, (user_id,))
            
            unread_manga = cur.fetchall()
            
            if not unread_manga:
                # If user has read everything, just return recent manga
                cur.execute("""
                    SELECT id, title, alt_titles, description, 
                           genre, author, artist, cover_image
                    FROM manga
                    ORDER BY created_at DESC
                    LIMIT %s
                """, (limit,))
                unread_manga = cur.fetchall()
            
            # Score each manga based on user preferences
            recommendations = []
            for row in unread_manga:
                manga = {
                    'id': row[0],
                    'title': row[1],
                    'alt_titles': row[2] or [],
                    'description': row[3],
                    'genre': row[4] or [],
                    'author': row[5],
                    'artist': row[6],
                    'cover_image': row[7]
                }
                
                score = 0
                reasons = []
                
                if user_profile:
                    # Genre matching
                    matching_genres = set(manga['genre']) & set(user_profile.get('preferred_genres', []))
                    score += len(matching_genres) * 2
                    if matching_genres:
                        reasons.append(f'Matches your favorite genres: {", ".join(matching_genres)}')
                    
                    # Author matching
                    if manga['author'] in user_profile.get('preferred_authors', []):
                        score += 3
                        reasons.append(f'Author: {manga["author"]}')
                
                # Add to recommendations
                recommendations.append({
                    'manga': manga,
                    'score': score,
                    'reasons': reasons
                })
            
            # Sort by score and return top results
            recommendations.sort(key=lambda x: x['score'], reverse=True)
            
            return {
                'recommendations': [
                    {
                        **r['manga'],
                        'score': r['score'],
                        'reasons': r['reasons']
                    }
                    for r in recommendations[:limit]
                ]
            }
            
        except Exception as e:
            return {'error': str(e)}
        finally:
            cur.close()
            conn.close()
    
    def find_similar(self, manga_id, limit=5):
        """Find similar manga based on content"""
        conn = self._get_db_connection()
        cur = conn.cursor()
        
        try:
            # Get the target manga
            cur.execute("""
                SELECT id, title, alt_titles, description, genre, author, artist
                FROM manga WHERE id = %s
            """, (manga_id,))
            
            row = cur.fetchone()
            if not row:
                return {'error': 'Manga not found'}
            
            target_manga = {
                'id': row[0],
                'title': row[1],
                'alt_titles': row[2] or [],
                'description': row[3],
                'genre': row[4] or [],
                'author': row[5],
                'artist': row[6]
            }
            
            # Get all other manga
            cur.execute("""
                SELECT id, title, alt_titles, description, genre, author, artist
                FROM manga WHERE id != %s
            """, (manga_id,))
            
            all_manga = cur.fetchall()
            
            # Calculate similarity scores
            similarities = []
            target_text = self.get_manga_text(target_manga)
            target_embedding = self.generate_embedding(target_text)
            
            for row in all_manga:
                manga = {
                    'id': row[0],
                    'title': row[1],
                    'alt_titles': row[2] or [],
                    'description': row[3],
                    'genre': row[4] or [],
                    'author': row[5],
                    'artist': row[6]
                }
                
                # Calculate genre similarity
                genre_overlap = len(set(target_manga['genre']) & set(manga['genre']))
                
                # Calculate embedding similarity
                manga_text = self.get_manga_text(manga)
                manga_embedding = self.generate_embedding(manga_text)
                
                embedding_sim = cosine_similarity(
                    target_embedding.reshape(1, -1),
                    manga_embedding.reshape(1, -1)
                )[0][0]
                
                # Combined score
                score = (genre_overlap * 0.3) + (embedding_sim * 0.7)
                
                similarities.append({
                    'manga': manga,
                    'similarity_score': round(score, 3),
                    'genre_match': genre_overlap
                })
            
            # Sort by similarity
            similarities.sort(key=lambda x: x['similarity_score'], reverse=True)
            
            return {
                'source_manga': target_manga,
                'similar': [
                    {**s['manga'], 'similarity_score': s['similarity_score']}
                    for s in similarities[:limit]
                ]
            }
            
        except Exception as e:
            return {'error': str(e)}
        finally:
            cur.close()
            conn.close()
    
    def compute_all_embeddings(self):
        """Pre-compute embeddings for all manga (for offline use)"""
        conn = self._get_db_connection()
        cur = conn.cursor()
        
        try:
            cur.execute("""
                SELECT id, title, alt_titles, description, genre, author
                FROM manga
            """)
            
            manga_list = cur.fetchall()
            
            embeddings = {}
            for row in manga_list:
                manga = {
                    'id': row[0],
                    'title': row[1],
                    'alt_titles': row[2] or [],
                    'description': row[3],
                    'genre': row[4] or [],
                    'author': row[5]
                }
                
                text = self.get_manga_text(manga)
                embedding = self.generate_embedding(text)
                embeddings[manga['id']] = embedding.tolist()
            
            # Save to Redis
            if self.redis_client:
                self.redis_client.set('manga_embeddings', str(embeddings))
            
            return {'success': True, 'count': len(embeddings)}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            cur.close()
            conn.close()

