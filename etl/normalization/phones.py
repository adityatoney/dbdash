"""Normalize phone number values from raw XLSX data."""

import math


def normalize_phone(value):
    """
    Normalize a phone number value.

    Raw data may contain:
      - Float values like 1234567890.0
      - Int values like 1234567890
      - String values like "1234567890"
      - None or NaN

    Processing:
      - Convert float -> int -> str
      - Strip non-digit characters
      - Left-pad to 10 digits for US numbers (< 10 digits)
      - Return None for empty/invalid values

    Args:
        value: Raw phone value from XLSX data.

    Returns:
        str or None: Normalized phone string, or None if invalid.
    """
    if value is None:
        return None

    if isinstance(value, float):
        if math.isnan(value):
            return None
        value = int(value)

    if isinstance(value, int):
        value = str(value)

    if not isinstance(value, str):
        value = str(value)

    # Strip any non-digit characters
    digits = ''.join(c for c in value if c.isdigit())

    if not digits or digits == '0':
        return None

    # Left-pad short US numbers to 10 digits
    if len(digits) < 10:
        digits = digits.zfill(10)

    # If 11 digits starting with 1, strip the leading 1 (US country code)
    if len(digits) == 11 and digits.startswith('1'):
        digits = digits[1:]

    return digits
