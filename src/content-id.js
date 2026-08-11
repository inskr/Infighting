'use strict';

const CONTENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const WINDOWS_RESERVED_BASENAME_PATTERN = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

function isValidContentId(value) {
  return typeof value === 'string' && CONTENT_ID_PATTERN.test(value);
}

function isPortableContentId(value) {
  return isValidContentId(value) && !WINDOWS_RESERVED_BASENAME_PATTERN.test(value);
}

function foldContentId(value) {
  return typeof value === 'string' ? value.toLowerCase() : value;
}

module.exports = {
  CONTENT_ID_PATTERN,
  WINDOWS_RESERVED_BASENAME_PATTERN,
  foldContentId,
  isPortableContentId,
  isValidContentId
};
