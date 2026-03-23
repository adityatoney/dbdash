"""Normalize gender values from raw XLSX data."""

import math


def normalize_gender(value):
    """
    Normalize gender value to 'M' or 'F'.

    Raw data contains:
      - 1.0 (float) → 'M'
      - 2.0 (float) → 'F'
      - 'M' or 'F' (str) → pass-through
      - None/NaN/other → None

    Returns:
        tuple: (normalized_value, was_modified)
            normalized_value: 'M', 'F', or None
            was_modified: True if value was changed from original
    """
    if value is None:
        return (None, False)

    # Handle NaN (pandas float NaN)
    if isinstance(value, float) and math.isnan(value):
        return (None, False)

    # Handle numeric encoding
    if isinstance(value, (int, float)):
        if value == 1.0 or value == 1:
            return ('M', True)
        elif value == 2.0 or value == 2:
            return ('F', True)
        else:
            return (None, True)

    # Handle string values
    if isinstance(value, str):
        stripped = value.strip().upper()
        if stripped == 'M':
            return ('M', value != 'M')
        elif stripped == 'F':
            return ('F', value != 'F')
        elif stripped == 'MALE':
            return ('M', True)
        elif stripped == 'FEMALE':
            return ('F', True)
        else:
            return (None, True)

    return (None, True)
