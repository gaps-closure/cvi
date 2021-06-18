{-# LANGUAGE DeriveAnyClass #-}
{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE DuplicateRecordFields #-}
{-# LANGUAGE GADTs #-}
{-# LANGUAGE LambdaCase #-}
{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE RankNTypes #-}
{-# LANGUAGE ScopedTypeVariables #-}
{-# LANGUAGE TypeInType #-}

module Main where

import Control.Lens hiding (Iso)
import Control.Monad.IO.Class
import Control.Monad.Trans.Class
import qualified Data.Text as T
import Language.LSP.Diagnostics
import Language.LSP.Server
import Language.LSP.Types as J
import qualified Language.LSP.Types.Lens as J
import Language.LSP.VFS
import System.Log.Logger

sendDiagnostics :: J.NormalizedUri -> Maybe Int -> LspM config ()
sendDiagnostics fileUri version = do
  let diag =
        J.Diagnostic
          { J._range = J.Range (J.Position 42 4) (J.Position 42 15)
          , J._severity = Just J.DsError
          , J._code = Nothing
          , J._source = Just "example2.c"
          , J._message = "Conflict: Purple not shareable, wrapping not feasible"
          , J._tags = Nothing
          , J._relatedInformation = Just (J.List [])
          }
  publishDiagnostics 100 fileUri version (partitionBySource [diag])

handlers :: Handlers (LspM ())
handlers =
  mconcat
    [ notificationHandler SInitialized $ \notif -> pure (),
      notificationHandler STextDocumentDidOpen $ \msg -> do
        let doc = msg ^. J.params . J.textDocument . J.uri
            fileName = J.uriToFilePath doc
        liftIO $ debugM "reactor.handle" $ "Processing DidOpenTextDocument for: " ++ show fileName
        sendDiagnostics (J.toNormalizedUri doc) (Just 0),
      notificationHandler STextDocumentDidChange $ \msg -> do
        let doc = msg ^. J.params . J.textDocument . J.uri
            fileName = J.uriToFilePath doc
        liftIO $ debugM "reactor.handle" $ "Processing DidOpenTextDocument for: " ++ show fileName
        sendDiagnostics (J.toNormalizedUri doc) (Just 0)
    ]

syncOptions :: J.TextDocumentSyncOptions
syncOptions = J.TextDocumentSyncOptions
  { J._openClose         = Just True
  , J._change            = Just J.TdSyncFull
  , J._willSave          = Just False
  , J._willSaveWaitUntil = Just False
  , J._save              = Just $ J.InR $ J.SaveOptions $ Just False
  }

lspOptions :: Options
lspOptions = defaultOptions
  { textDocumentSync = Just syncOptions
  , executeCommandCommands = Just ["lsp-hello-command"]
  }

main :: IO Int
main =
  runServer $
    ServerDefinition
      { onConfigurationChange = const $ const $ Right (),
        defaultConfig = (),
        doInitialize = \env _req -> pure $ Right env,
        staticHandlers = handlers,
        interpretHandler = \env -> Iso (runLspT env) liftIO,
        options = lspOptions
      }