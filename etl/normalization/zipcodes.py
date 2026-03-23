"""Normalize zipcode values from raw XLSX data."""

import math


def normalize_zipcode(value):
    """
    Normalize a zipcode value.

    Raw data may contain:
      - Float values like 7078.0 (should be "07078")
      - Int values like 7078
      - String values like "07078"
      - None or NaN

    Processing:
      - Convert float -> int -> str
      - Left-pad to 5 digits for US zipcodes
      - Handle None/NaN

    Args:
        value: Raw zipcode value from XLSX data.

    Returns:
        str or None: Normalized zipcode string, or None if invalid.
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

    stripped = value.strip()
    if not stripped or stripped == '0':
        return None

    # Strip any non-alphanumeric characters (some zipcodes have dashes like 07078-1234)
    # Keep the dash for ZIP+4 format
    cleaned = stripped

    # If it looks like a pure numeric US zip, left-pad to 5 digits
    digits_only = ''.join(c for c in cleaned if c.isdigit())
    if cleaned == digits_only and len(cleaned) < 5:
        cleaned = cleaned.zfill(5)

    return cleaned
