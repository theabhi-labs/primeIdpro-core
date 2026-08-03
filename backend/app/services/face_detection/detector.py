import cv2
import logging

logger = logging.getLogger(__name__)

class FaceDetector:
    def __init__(self):
        # Load OpenCV's pre-trained face cascade
        from app.main import get_cv2_data_path
        cascade_path = get_cv2_data_path("haarcascade_frontalface_default.xml")
        self.face_cascade = cv2.CascadeClassifier(cascade_path)
        if self.face_cascade.empty():
            logger.error("Failed to load face cascade classifier")
        else:
            logger.info("✅ Face Detector initialized (OpenCV)")
    
    def detect_face(self, image_path):
        try:
            # Read image
            img = cv2.imread(image_path)
            if img is None:
                logger.error(f"Could not read image: {image_path}")
                return None, None
            
            # Convert to grayscale
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # Detect faces
            faces = self.face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(30, 30)
            )
            
            if len(faces) == 0:
                logger.warning("No face detected")
                return None, None
            
            # Get first face
            x, y, w, h = faces[0]
            
            # Add padding (20%)
            padding_x = int(w * 0.2)
            padding_y = int(h * 0.2)
            
            x = max(0, x - padding_x)
            y = max(0, y - padding_y)
            w = min(img.shape[1] - x, w + (2 * padding_x))
            h = min(img.shape[0] - y, h + (2 * padding_y))
            
            face_coords = {
                "x": x,
                "y": y,
                "width": w,
                "height": h,
                "confidence": 0.95
            }
            
            # Crop face
            face_img = img[y:y+h, x:x+w]
            
            logger.info(f"✅ Face detected at position: x={x}, y={y}, w={w}, h={h}")
            return face_coords, face_img
            
        except Exception as e:
            logger.error(f"Face detection error: {e}")
            return None, None