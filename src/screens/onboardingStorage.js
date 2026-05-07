const STORAGE_VERSION = "ka_k52_onboarding_v1";

function readStorage(key, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeOnboardingStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Local persistence is optional; private browsing can block it.
  }
}

export function getOnboardingStorageKeys(userId = "anon") {
  return {
    done: `${STORAGE_VERSION}_${userId}_done`,
    step: `${STORAGE_VERSION}_${userId}_step`,
    completed: `${STORAGE_VERSION}_${userId}_completed`,
  };
}

export function readOnboardingStorage(key, fallback = "") {
  return readStorage(key, fallback);
}

export function hasCompletedOnboarding(userId = "anon") {
  return readStorage(getOnboardingStorageKeys(userId).done) === "1";
}
