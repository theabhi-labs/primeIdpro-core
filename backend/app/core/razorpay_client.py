import razorpay
import logging
from app.core.config import settings

logger = logging.getLogger("primeidpro.payment")

# Initialize Razorpay Client with environment settings
razorpay_client = razorpay.Client(
    auth=(
        settings.razorpay_key_id or "rzp_test_placeholder",
        settings.razorpay_key_secret or "placeholder_secret",
    )
)
razorpay_client.set_app_details({"title": "PrimeIDPro", "version": settings.app_version})
