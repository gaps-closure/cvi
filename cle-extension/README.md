# CLE VSCode extension 

## Requirements

- nodejs
- npm
- python3.8
- libzmq

## Quick start

```bash
npm install
python3 -m pip install -r conflict-analyzer/requirements.txt
```

Press `f5` to build and open the extension in a new window. 
A `*.c` or `*.cpp` file must be opened to activate the extension. 

## Requirements of Language Server

### Diagnostics:
- Starting and ending line number and character
- Diagnostic message
- Severity (Error, Warning, Information, Hint)
