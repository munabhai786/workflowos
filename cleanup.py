import os
import shutil
import stat
import glob

def remove_readonly(func, path, excinfo):
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception as e:
        print(f"Failed to delete {path}: {e}")

def main():
    # Automatically change working directory to this script's directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    print(f"Working directory changed to: {os.getcwd()}")

    # Files/folders to delete
    items = [
        "TMP2.txt",
        "TODO.md",
        "TODO_PHASE11.md",
        "TODO_PHASE12.md",
        "README_PHASE1_OPTIONAL_TASK_PROJECT.md",
        "docs",
        "backend/test_openai.py",
        "backend/config.py",
        "backend/app/utils/otp_store.py",
        "frontend/vite-dev.log",
        "frontend/vite-landing.err.log",
        "frontend/vite-landing.out.log",
        "frontend/vite-phase3.err.log",
        "frontend/vite-phase3.out.log",
        "frontend/vite-redesign.err.log",
        "frontend/vite-redesign.out.log"
    ]
    
    # Deleting specific items
    for item in items:
        if os.path.exists(item):
            print(f"Deleting {item}")
            if os.path.isdir(item):
                shutil.rmtree(item, onerror=remove_readonly)
            else:
                try:
                    os.chmod(item, stat.S_IWRITE)
                    os.remove(item)
                except Exception as e:
                    print(f"Failed to delete file {item}: {e}")
                    
    # Wildcards deletion
    patterns = [
        "pytest-cache-files-*",
        "backend/pytest-cache-files-*"
    ]
    for pattern in patterns:
        for path in glob.glob(pattern):
            if os.path.isdir(path):
                print(f"Deleting cache dir: {path}")
                shutil.rmtree(path, onerror=remove_readonly)

if __name__ == "__main__":
    main()
