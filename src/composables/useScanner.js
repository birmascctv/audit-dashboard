import { ref, onMounted, onUnmounted } from 'vue';

export function useScanner(options = {}) {
  const isListening = ref(true);
  const multiplier = ref(1);
  const lastScannedBarcode = ref(null);
  const scanFeedback = ref({ type: 'idle', message: '', timestamp: 0 });

  let buffer = '';
  let lastKeyTime = 0;
  let lastProcessed = { code: '', at: 0 };
  let feedbackTimer = null;

  function publishFeedback(type, message) {
    const timestamp = Date.now();
    scanFeedback.value = { type, message, timestamp };
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      if (scanFeedback.value.timestamp === timestamp) {
        scanFeedback.value = { type: 'idle', message: '', timestamp: 0 };
      }
    }, 4000);
  }

  function processBarcode(barcodeToProcess) {
    const cleaned = (barcodeToProcess || '').trim();
    if (!cleaned) return;

    const now = Date.now();
    if (cleaned === lastProcessed.code && now - lastProcessed.at < 400) return;
    lastProcessed = { code: cleaned, at: now };
    lastScannedBarcode.value = cleaned;

    let result;
    try {
      result = options.onScan ? options.onScan(cleaned) : true;
    } catch (error) {
      publishFeedback('error', error?.message || `Failed: ${cleaned}`);
      return;
    }

    const handleResult = (res) => {
      const success = typeof res === 'boolean' ? res : Boolean(res?.success ?? res);
      const message = typeof res === 'boolean'
        ? (res ? `Scanned: ${cleaned}` : `Barcode not found: ${cleaned}`)
        : (res?.message || (success ? `Scanned: ${cleaned}` : `Failed: ${cleaned}`));
      publishFeedback(success ? 'success' : 'error', message);
    };

    if (result && typeof result.then === 'function') {
      result.then(handleResult).catch((error) => publishFeedback('error', error?.message || `Failed: ${cleaned}`));
    } else {
      handleResult(result);
    }
  }

  function handleKeyDown(event) {
    if (!isListening.value) return;
    const target = event.target;
    const isDedicatedScanInput = target?.id === 'scanner-main-input';
    const isGenericInput = target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) &&
      !isDedicatedScanInput;

    const currentTime = Date.now();
    const timeDiff = currentTime - lastKeyTime;
    if (isDedicatedScanInput && event.key.length === 1) {
      if (target.value && (timeDiff > 500 || target.value.length >= 40)) target.value = '';
      lastKeyTime = currentTime;
    }

    if (event.key === 'Enter') {
      if (isDedicatedScanInput) {
        event.preventDefault();
        const inputVal = target.value.length > 40 ? '' : target.value;
        if (inputVal) {
          processBarcode(inputVal);
          target.value = '';
        } else if (buffer.length >= 3) {
          processBarcode(buffer);
          buffer = '';
        }
        return;
      }
      if (isGenericInput) return;
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
      if (timeDiff > 250 && !isDedicatedScanInput) buffer = '';
      buffer += event.key;
      lastKeyTime = currentTime;
    }
  }

  onMounted(() => window.addEventListener('keydown', handleKeyDown));
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
    clearTimeout(feedbackTimer);
  });

  return { isListening, multiplier, lastScannedBarcode, scanFeedback, processBarcode };
}
