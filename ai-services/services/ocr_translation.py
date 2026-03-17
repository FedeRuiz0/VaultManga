import io
import numpy as np
from PIL import Image
import easyocr
from transformers import pipeline

class OCRTranslationService:
    def __init__(self):
        self.ocr_reader = None
        self.translators = {}
        self._init_ocr()
    
    def _init_ocr(self):
        """Initialize EasyOCR reader"""
        print("Initializing OCR reader...")
        # Initialize with common languages for manga
        self.ocr_reader = easyocr.Reader(['ja', 'ko', 'zh'], gpu=True, verbose=False)
        print("OCR reader initialized")
    
    def _get_translator(self, target_lang='en'):
        """Get or create translator for target language"""
        if target_lang not in self.translators:
            # Use Helsinki-NLP opus-mt for translation
            model_name = f"Helsinki-NLP/opus-mt-{target_lang}"
            # Note: For Japanese/Korean to English, we'd need multilingual models
            # This is a simplified example
            if target_lang == 'en':
                # Use multilingual model
                self.translators[target_lang] = pipeline(
                    "translation", 
                    model="facebook/mbart-large-50-many-to-many-mmt"
                )
            else:
                self.translators[target_lang] = pipeline(
                    "translation",
                    model=f"Helsinki-NLP/opus-mt-mul-en"
                )
        return self.translators[target_lang]
    
    def process_image(self, image_file, target_lang='en'):
        """Process a manga page image with OCR and translation"""
        try:
            # Load image
            image = Image.open(image_file)
            
            # Perform OCR
            results = self.ocr_reader.readtext(
                np.array(image),
                detail=1,  # Return confidence scores
                paragraph=True
            )
            
            # Extract text regions with translations
            translated_regions = []
            
            for bbox, text, confidence in results:
                if confidence < 0.3:  # Skip low confidence
                    continue
                
                # Translate text
                translated = text  # Placeholder - actual translation would use model
                
                translated_regions.append({
                    'original_text': text,
                    'translated_text': translated,
                    'confidence': round(confidence, 2),
                    'bbox': bbox  # [x1, y1, x2, y2]
                })
            
            # Generate overlay image with translations
            overlay_image = self._create_translation_overlay(
                image, translated_regions
            )
            
            return {
                'success': True,
                'regions': translated_regions,
                'total_regions': len(translated_regions),
                'overlay_image': overlay_image  # Would return base64 or URL
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def process_image_url(self, image_url, target_lang='en'):
        """Process an image from URL"""
        import requests
        try:
            # Download image
            response = requests.get(image_url)
            image = Image.open(io.BytesIO(response.content))
            
            # Process as normal
            return self.process_image(image, target_lang)
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def _create_translation_overlay(self, original_image, regions):
        """Create an overlay image with translated text"""
        # This would create a new image with translations overlaid
        # In practice, you'd use PIL to draw text boxes
        return None  # Placeholder
    
    def batch_process(self, image_paths, target_lang='en'):
        """Process multiple images"""
        results = []
        
        for path in image_paths:
            try:
                with open(path, 'rb') as f:
                    result = self.process_image(f, target_lang)
                    result['path'] = path
                    results.append(result)
            except Exception as e:
                results.append({
                    'path': path,
                    'success': False,
                    'error': str(e)
                })
        
        return results
    
    def detect_bubbles(self, image):
        """Detect speech bubbles in manga image (advanced)"""
        # This would use computer vision to detect text bubbles
        # Placeholder implementation
        return []
    
    def extract_text_regions(self, image):
        """Extract text regions from image"""
        results = self.ocr_reader.readtext(np.array(image))
        
        regions = []
        for bbox, text, confidence in results:
            regions.append({
                'text': text,
                'confidence': confidence,
                'bbox': bbox
            })
        
        return regions


# Example usage
if __name__ == '__main__':
    service = OCRTranslationService()
    
    # Example: Process an image
    # result = service.process_image('manga_page.jpg', target_lang='en')
    # print(result)

