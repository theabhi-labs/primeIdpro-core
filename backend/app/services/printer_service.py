import os
import win32print
import win32api
import traceback

def get_default_printer() -> str:
    """Gets the default OS printer name."""
    try:
        return win32print.GetDefaultPrinter()
    except Exception as e:
        print(f"Error getting default printer: {e}")
        return ""

def print_file(file_path: str, printer_name: str = None) -> bool:
    """
    Dispatches a file to the printer using win32api.ShellExecute.
    """
    if not os.path.exists(file_path):
        print(f"File to print not found: {file_path}")
        return False
        
    if not printer_name:
        print("No printer configured. Please configure a printer in settings.")
        return False
        
    try:
        # win32api.ShellExecute(hwnd, op, file, params, dir, bShow)
        # Using 'printto' verb to print to a specific printer
        res = win32api.ShellExecute(
            0,
            "printto",
            file_path,
            f'"{printer_name}"',
            ".",
            0
        )
        # ShellExecute returns an HINSTANCE > 32 on success. A value <= 32 indicates an error.
        if int(res) <= 32:
            print(f"ShellExecute failed with code: {res}")
            return False
        return True
    except Exception as e:
        print(f"Failed to dispatch to printer: {e}")
        traceback.print_exc()
        return False
