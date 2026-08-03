from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from app.models.image import Image, ProcessingStatus
from app.services.pipeline import ProcessingPipeline
from app.core.config import settings
import os
import logging


from app.models.image import Image, ProcessingStatus
from app.services.pipeline import ProcessingPipeline
from app.services.resize.presets import PASSPORT_PRESETS, get_preset_by_country, get_all_countries
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()
pipeline = ProcessingPipeline()

async def process_image_background(image_id: str, session_id: str, background_color: str, 
                                   passport_standard: str, enhance: bool):
    """Background task for image processing"""
    try:
        logger.info(f"🔄 Starting background processing for image: {image_id}")
        
        # Get image from database
        image = await Image.get(image_id)
        if not image:
            logger.error(f"❌ Image not found: {image_id}")
            return
        
        # Update status to processing
        image.processing_status = ProcessingStatus.PROCESSING
        await image.save()
        logger.info(f"📝 Status updated to processing for {image_id}")
        
        # Get original image path
        original_path = os.path.join(".", image.original_url.lstrip("/"))
        logger.info(f"📷 Original image path: {original_path}")
        
        # Check if file exists
        if not os.path.exists(original_path):
            logger.error(f"❌ Image file not found: {original_path}")
            image.processing_status = ProcessingStatus.FAILED
            image.processing_error = "Image file not found"
            await image.save()
            return
        
        # Process image
        logger.info(f"🤖 Starting AI processing for {image_id}")
        result = await pipeline.process_image(
            original_path,
            session_id,
            image_id,
            background_color,
            passport_standard,
            enhance
        )
        
        if result["success"]:
            # Update image with processed URLs
            image.face_detected = result["face_detected"]
            image.face_coordinates = result["face_coordinates"]
            image.face_confidence = result.get("face_confidence")
            image.face_detected_url = result.get("face_cropped_path")
            image.bg_removed_url = result.get("bg_removed_path")
            image.enhanced_url = result.get("enhanced_path")
            image.passport_url = result.get("passport_path")
            image.processing_status = ProcessingStatus.COMPLETED
            logger.info(f"✅ Image {image_id} processed successfully")
        else:
            image.processing_status = ProcessingStatus.FAILED
            image.processing_error = result.get("error")
            logger.error(f"❌ Image {image_id} processing failed: {result.get('error')}")
        
        await image.save()
        
    except Exception as e:
        logger.error(f"❌ Background processing error for {image_id}: {e}")
        import traceback
        traceback.print_exc()
        try:
            image = await Image.get(image_id)
            if image:
                image.processing_status = ProcessingStatus.FAILED
                image.processing_error = str(e)
                await image.save()
        except:
            pass

@router.post("/single/{image_id}")
async def process_single_image(
    image_id: str,
    background_color: str = "#FFFFFF",
    passport_standard: str = "35x45",
    enhance: bool = False,  # Default False for natural look
    background_tasks: BackgroundTasks = None
):
    """Process a single image with AI features - Natural quality, white background"""
    
    logger.info(f"🔵 Processing request for image: {image_id}")
    logger.info(f"   Settings: BG={background_color}, Standard={passport_standard}, Enhance={enhance}")
    
    # Get image from database
    image = await Image.get(image_id)
    if not image:
        logger.error(f"❌ Image not found: {image_id}")
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Check if already processing
    if image.processing_status == ProcessingStatus.PROCESSING:
        logger.warning(f"⚠️ Image already processing: {image_id}")
        raise HTTPException(status_code=400, detail="Image already processing")
    
    # Start background processing
    background_tasks.add_task(
        process_image_background,
        image_id,
        image.session_id,
        background_color,
        passport_standard,
        enhance
    )
    
    logger.info(f"✅ Processing started for {image_id}")
    
    return JSONResponse({
        "success": True,
        "image_id": image_id,
        "status": "processing",
        "message": "Image processing started with white background"
    })

@router.get("/status/{image_id}")
async def get_processing_status(image_id: str):
    """Get processing status of an image"""
    
    logger.info(f"🔍 Status check for image: {image_id}")
    
    image = await Image.get(image_id)
    if not image:
        logger.error(f"❌ Image not found: {image_id}")
        raise HTTPException(status_code=404, detail="Image not found")
    
    response = {
        "image_id": image_id,
        "status": image.processing_status,
        "face_detected": image.face_detected,
        "face_confidence": image.face_confidence,
        "passport_url": image.passport_url,
        "bg_removed_url": image.bg_removed_url,
        "enhanced_url": image.enhanced_url,
        "error": image.processing_error
    }
    
    logger.info(f"📊 Status for {image_id}: {image.processing_status}")
    
    return response

@router.post("/sync/{image_id}")
async def process_sync(image_id: str, background_color: str = "#FFFFFF", passport_standard: str = "35x45"):
    """Synchronous processing for testing - No enhancement, white background"""
    
    logger.info(f"🔵 Synchronous processing for image: {image_id}")
    
    image = await Image.get(image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    original_path = os.path.join(".", image.original_url.lstrip("/"))
    
    result = await pipeline.process_image(
        original_path,
        image.session_id,
        image_id,
        background_color,
        passport_standard,
        enhance=False  # Force no enhancement
    )
    
    if result["success"]:
        image.face_detected = result["face_detected"]
        image.face_coordinates = result["face_coordinates"]
        image.face_confidence = result.get("face_confidence")
        image.passport_url = result.get("passport_path")
        image.bg_removed_url = result.get("bg_removed_path")
        image.processing_status = "completed"
        await image.save()
        
        return JSONResponse({
            "success": True,
            "passport_url": image.passport_url,
            "message": "Processing complete"
        })
    else:
        return JSONResponse({
            "success": False,
            "error": result.get("error")
        }, status_code=500)

@router.get("/standards")
async def get_passport_standards():
    """Get available passport standards"""
    from app.services.resize.resizer import PassportResizer
    resizer = PassportResizer()
    return {
        "standards": resizer.get_available_standards()
    }

@router.post("/test-quality/{image_id}")
async def test_quality(image_id: str):
    """Test quality with minimal processing"""
    
    logger.info(f"🔵 Quality test for image: {image_id}")
    
    image = await Image.get(image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Simplified pipeline - only background removal and resize
    from app.services.background.remover import BackgroundRemover
    from app.services.resize.resizer import PassportResizer
    
    original_path = os.path.join(".", image.original_url.lstrip("/"))
    
    try:
        # Step 1: Background removal only
        bg_remover = BackgroundRemover()
        bg_removed = bg_remover.remove_background(original_path, "#FFFFFF")
        
        if bg_removed:
            # Step 2: Resize only
            resizer = PassportResizer()
            passport_img, specs = resizer.resize_to_standard(bg_removed, "35x45")
            
            if passport_img:
                # Save
                timestamp = __import__('datetime').datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"{timestamp}_{image_id}_quality_test.jpg"
                save_dir = os.path.join(settings.upload_dir, "sessions", image.session_id, "processed")
                os.makedirs(save_dir, exist_ok=True)
                file_path = os.path.join(save_dir, filename)
                passport_img.save(file_path, "JPEG", quality=95)
                
                image.passport_url = f"/uploads/sessions/{image.session_id}/processed/{filename}"
                image.processing_status = "completed"
                await image.save()
                
                return JSONResponse({
                    "success": True,
                    "passport_url": image.passport_url,
                    "message": "Quality test complete - Natural look, white background"
                })
        
        return JSONResponse({
            "success": False,
            "error": "Quality test failed"
        }, status_code=500)
        
    except Exception as e:
        logger.error(f"Quality test error: {e}")
        return JSONResponse({
            "success": False,
            "error": str(e)
        }, status_code=500)