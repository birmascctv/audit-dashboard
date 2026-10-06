import { ref, onMounted, onUnmounted } from 'vue';
import { playScanSuccessSound, playScanErrorSound } from '../utils/audio.js';

export function useScanner(options = {}) {
  const isListening = ref(true);
  const soundEnabled = ref(options.soundEnabled ?? true);
  const multiplier = ref(1);
  const lastScannedBarcode = ref(null);
  const scanFeedback = ref({
    type: 'idle',
    message: '',
    timestamp: 0,
  });

  // Internal buffer for rapid scanner keystrokes
  let buffer = '';
  let lastKeyTime = 0;

  function processBarcode(barcodeToProcess) {
    const cleaned = (barcodeToProcess || '').trim();
    if (!cleaned) return;

    lastScannedBarcode.value = cleaned;
    const result = options.onScan ? options.onScan(cleaned) : true;

    let isSuccess = false;
    let msg = '';

    if (typeof result === 'boolean') {
      isSuccess = result;
      msg = result ? `Scanned: ${cleaned}` : `Barcode not found: ${cleaned}`;
    } else if (result && typeof result.then === 'function') {
      result.then((res) => {
        const ok = res?.success ?? true;
        if (ok) {
          if (soundEnabled.value) playScanSuccessSound();
          scanFeedback.value = {
            type: 'success',
            message: res?.message || `Scanned: ${cleaned}`,
            timestamp: Date.now(),
          };
        } else {
          if (soundEnabled.value) playScanErrorSound();
          scanFeedback.value = {
            type: 'error',
            message: res?.message || `Failed: ${cleaned}`,
            timestamp: Date.now(),
          };
        }
      });
      return;
    } else if (result) {
      isSuccess = result.success;
      msg = result.message || (isSuccess ? `Scanned: ${cleaned}` : `Failed: ${cleaned}`);
    }

    if (isSuccess) {
      if (soundEnabled.value) playScanSuccessSound();
      scanFeedback.value = {
        type: 'success',
        message: msg,
        timestamp: Date.now(),
      };
    } else {
      if (soundEnabled.value) playScanErrorSound();
      scanFeedback.value = {
        type: 'error',
        message: msg,
        timestamp: Date.now(),
      };
    }

    setTimeout(() => {
      if (Date.now() - scanFeedback.value.timestamp >= 3900) {
        scanFeedback.value = { type: 'idle', message: '', timestamp: 0 };
      }
    }, 4000);
  }

  function handleKeyDown(event) {
    if (!isListening.value) return;

    const target = event.target;
    const isDedicatedScanInput = target?.id === 'scanner-main-input';
    const isGenericInput =
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) &&
      !isDedicatedScanInput;

    const currentTime = Date.now();
    const timeDiff = currentTime - lastKeyTime;

    if (event.key === 'Enter') {
      if (isDedicatedScanInput) {
        event.preventDefault();
        const inputVal = target.value;
        if (inputVal) {
          processBarcode(inputVal);
          target.value = '';
        } else if (buffer.length >= 3) {
          processBarcode(buffer);
          buffer = '';
        }
        return;
      }

      if (isGenericInput) {
        return;
      }

      if (buffer.length >= 3) {
        event.preventDefault();
        processBarcode(buffer);
        buffer = '';
      }
      return;
    }

    if (isGenericInput) {
      buffer = '';
      return;
    }

    if (event.key.length === 1) {
      if (timeDiff > 250 && !isDedicatedScanInput) {
        buffer = '';
      }
      buffer += event.key;
      lastKeyTime = currentTime;
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });

  return {
    isListening,
    soundEnabled,
    multiplier,
    lastScannedBarcode,
    scanFeedback,
    processBarcode,
  };
}
