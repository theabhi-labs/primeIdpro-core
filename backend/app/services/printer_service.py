import os
import win32print
import win32ui
import win32con
import traceback
from PIL import Image, ImageWin
import fitz

def get_default_printer() -> str:
    """Gets the default OS printer name."""
    try:
        return win32print.GetDefaultPrinter()
    except Exception as e:
        print(f"Error getting default printer: {e}")
        return ""

def print_file(file_path: str, printer_name: str = None) -> bool:
    """
    Direct Native Windows GDI Print Engine:
    Dispatches 300 DPI Images and Multi-page PDFs directly to any OS printer (Epson, Canon, HP, Brother, PDF, etc.)
    without relying on external Photo Viewer apps or broken ShellExecute verbs.
    """
    if not os.path.exists(file_path):
        print(f"File to print not found: {file_path}")
        return False

    # Clean printer name in case "Default: " prefix is present
    target_p = printer_name.strip() if printer_name else None
    if target_p and target_p.startswith("Default:"):
        target_p = target_p.replace("Default:", "").strip()

    p_name = target_p or get_default_printer()
    if not p_name:
        print("No printer configured or detected.")
        return False

    ext = os.path.splitext(file_path)[1].lower()
    doc_title = f"PrimeIDPro_{os.path.basename(file_path)}"
    is_pdf_printer = "pdf" in p_name.lower()

    try:
        hdc = win32ui.CreateDC()
        hdc.CreatePrinterDC(p_name)

        printable_w = hdc.GetDeviceCaps(win32con.HORZRES)
        printable_h = hdc.GetDeviceCaps(win32con.VERTRES)

        # For virtual PDF printers, pass output path to prevent hanging on modal dialogs
        if is_pdf_printer:
            out_pdf = os.path.splitext(file_path)[0] + "_output.pdf"
            hdc.StartDoc(doc_title, out_pdf)
        else:
            hdc.StartDoc(doc_title)

        if ext == '.pdf':
            doc = fitz.open(file_path)
            for i in range(len(doc)):
                page = doc.load_page(i)
                pix = page.get_pixmap(dpi=300)
                page_img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                hdc.StartPage()
                dib = ImageWin.Dib(page_img)
                dib.draw(hdc.GetHandleOutput(), (0, 0, printable_w, printable_h))
                hdc.EndPage()
            doc.close()
        else:
            img = Image.open(file_path)
            if img.mode != 'RGB':
                img = img.convert('RGB')
            hdc.StartPage()
            dib = ImageWin.Dib(img)
            dib.draw(hdc.GetHandleOutput(), (0, 0, printable_w, printable_h))
            hdc.EndPage()

        hdc.EndDoc()
        hdc.DeleteDC()
        print(f"Successfully dispatched '{file_path}' to printer '{p_name}'.")
        return True
    except Exception as e:
        print(f"Direct Windows GDI Print failed: {e}")
        traceback.print_exc()
        return False
