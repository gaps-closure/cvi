from pygls.lsp import (Diagnostic, DidChangeTextDocumentParams,
                       DidOpenTextDocumentParams)
from pygls.lsp.methods import TEXT_DOCUMENT_DID_CHANGE, TEXT_DOCUMENT_DID_OPEN
from pygls.lsp.types import Position, Range
from pygls.server import LanguageServer

server = LanguageServer()

# Sends back constant diagnostics
# TODO: Interface with conflict analyzer
def validate(ls, text_doc):
    diagnostic = Diagnostic(
        range=Range(
            start=Position(line=0, character=1),
            end=Position(line=0, character=1)),
        message="Example CLE Message"
    )

    ls.publish_diagnostics(text_doc.uri, [diagnostic])

@server.feature(TEXT_DOCUMENT_DID_OPEN)
def did_open(ls, params: DidOpenTextDocumentParams):
    text_doc = ls.workspace.get_document(params.text_document.uri)
    ls.show_message_log(f"{text_doc} opened.")
    validate(ls, text_doc)

@server.feature(TEXT_DOCUMENT_DID_CHANGE)
def did_change(ls, params: DidChangeTextDocumentParams):
    text_doc = ls.workspace.get_document(params.text_document.uri)
    ls.show_message_log(f"{text_doc} changed.")
    validate(ls, text_doc)

server.start_io()
