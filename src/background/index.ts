import { getAppSettings } from "../shared/storage";

chrome.runtime.onInstalled.addListener(() => {
  void getAppSettings();
});

chrome.runtime.onStartup?.addListener(() => {
  void getAppSettings();
});
