{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE OverloadedStrings #-}

import Control.Monad
import Data.Aeson
import qualified Data.ByteString.Char8 as CS
import qualified Data.ByteString.Lazy.Char8 as LCS
import GHC.Generics
import System.ZMQ4.Monadic

data Diagnostic = Diagnostic
  { lineNo :: Int,
    description :: String,
    source :: String,
    hint :: Maybe String
  }
  deriving (Generic, Show)

instance FromJSON Diagnostic
instance ToJSON Diagnostic

diagnostic :: Diagnostic
diagnostic =
  Diagnostic
    42
    "Conflict: Purple not shareable, wrapping not feasible"
    "example2.c"
    Nothing

main :: IO ()
main = do
  putStr "\n"
  runZMQ $ do
    rep <- socket Rep
    bind rep "tcp://*:5555"
    liftIO $ putStrLn "Bound to address: tcp://*:5555"
    forever $ do
      str <- receive rep
      liftIO $ do
        putStrLn "Received message: "
        CS.putStrLn str
        putStrLn "Sending JSON: "
        LCS.putStrLn (encode diagnostic)
