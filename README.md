# CLE VSCode extension 

## Quick start

```bash
npm install
python3 -m pip install -r requirements.txt
```

Press `CTRL+SHIFT+B` to start typescript compilation inside watch mode.

Press `f5` to open the extension in a new window. 
A `*.c` or `*.cpp` file must be opened to activate the extension. 

## Requirements of Language Server

### Diagnostics:
- Starting and ending line number and character
- Diagnostic message
- Severity (Error, Warning, Information, Hint)
