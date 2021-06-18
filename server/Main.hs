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

import Control.Lens hiding (Context, Iso)
import Control.Monad.IO.Class
import Control.Monad.IO.Unlift
import Control.Monad.Trans.Class
import qualified Data.Aeson as A
import qualified Data.ByteString.Char8 as BS
import qualified Data.ByteString.Lazy as LBS
import qualified Data.Text as T
import GHC.Generics
import Language.LSP.Diagnostics
import Language.LSP.Server
import Language.LSP.Types as J
import qualified Language.LSP.Types.Lens as J
import Language.LSP.VFS
import System.Console.GetOpt
import System.Environment (getArgs)
import System.Log.Logger
import System.ZMQ4

data Diag = Diag
  { lineNo :: Int,
    description :: String,
    source :: String,
    hint :: Maybe String
  }
  deriving (Generic, Show)

instance A.FromJSON Diag

instance A.ToJSON Diag

type Config = (Context, Socket Req)

type LspM' = LspM Config

getDiagnostics :: J.NormalizedUri -> Maybe Int -> LspM' ()
getDiagnostics fileUri version = do
  (ctx, req) <- getConfig
  liftIO $ send req [] $ BS.pack $ show fileUri
  str <- liftIO $ receive req
  case A.decode (LBS.fromStrict str) of
    Just (Diag lineNo description source _) -> do
      let diag =
            J.Diagnostic
              { J._range = J.Range (J.Position lineNo 0) (J.Position lineNo 1000),
                J._severity = Just J.DsError,
                J._code = Nothing,
                J._source = Just $ T.pack source,
                J._message = T.pack description,
                J._tags = Nothing,
                J._relatedInformation = Just (J.List [])
              }

      publishDiagnostics 100 fileUri version (partitionBySource [diag])
    _ ->
      liftIO $
        warningM "cleLangServer" $ "Could not decode diagnostic: " ++ BS.unpack str

handlers :: Handlers LspM'
handlers =
  mconcat
    [ notificationHandler SInitialized $ \notif -> pure (),
      notificationHandler STextDocumentDidOpen $ \msg -> do
        let doc = msg ^. J.params . J.textDocument . J.uri
            fileName = J.uriToFilePath doc
        liftIO $ debugM "cleLangServer" $ "Processing DidOpenTextDocument for: " ++ show fileName
        getDiagnostics (J.toNormalizedUri doc) (Just 0),
      notificationHandler STextDocumentDidChange $ \msg -> do
        let doc = msg ^. J.params . J.textDocument . J.uri
            fileName = J.uriToFilePath doc
        liftIO $ debugM "cleLangServer" $ "Processing DidTextDocumentChange for: " ++ show fileName
        getDiagnostics (J.toNormalizedUri doc) (Just 0)
    ]

syncOptions :: J.TextDocumentSyncOptions
syncOptions =
  J.TextDocumentSyncOptions
    { J._openClose = Just True,
      J._change = Just J.TdSyncFull,
      J._willSave = Just False,
      J._willSaveWaitUntil = Just False,
      J._save = Just $ J.InR $ J.SaveOptions $ Just False
    }

lspOptions :: Options
lspOptions =
  defaultOptions
    { textDocumentSync = Just syncOptions,
      executeCommandCommands = Just ["lsp-hello-command"]
    }

newtype Arg
  = ZeroMqAddr String
  deriving (Show, Eq)

options :: [OptDescr Arg]
options =
  [ Option ['a'] ["addr", "address"] (ReqArg ZeroMqAddr "") "Socket address to use for 0MQ"
  ]

usage :: String
usage = "Usage: cle-lang-server --addr [0MQ address]"

connectZMQ :: String -> IO Config
connectZMQ addr = do
  ctx <- context
  req <- socket ctx Req
  connect req addr
  return (ctx, req)

startLangServer :: Config -> IO Int
startLangServer cfg =
  runServer $
    ServerDefinition
      { onConfigurationChange = \env _ -> Right env,
        defaultConfig = cfg,
        doInitialize = \env _req -> pure $ Right env,
        staticHandlers = handlers,
        interpretHandler = \env -> Iso (runLspT env) liftIO,
        options = lspOptions
      }

main :: IO Int
main = do
  args <- getArgs
  let (opts, _, _) = getOpt Permute Main.options args
  case opts of
    [] -> do
      putStrLn usage
      return 1
    (ZeroMqAddr addr) : _ -> do
      infoM "cleLangServer" $ "Connecting to 0MQ address: " ++ addr
      cfg <- connectZMQ addr
      infoM "cleLangServer" $ "Connected to 0MQ address: " ++ addr
      infoM "cleLangServer" "Starting Language Server"
      startLangServer cfg