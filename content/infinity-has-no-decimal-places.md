---
title: "Infinity has no decimal places"
description: "Counting decimal places of a float with Decimal and as_tuple. The exponent is a string for infinity and NaN."
date: "2026-10-12"
tags:
  - python
---

I was reviewing a helper in my codebase. It counts decimal places of an
amount. Here it is.

```python
def _decimal_places(value: float) -> int:
    try:
        decimal_value = Decimal(str(value)).normalize()
    except (InvalidOperation, ValueError):
        return 0

    exponent = decimal_value.as_tuple().exponent
    return max(0, min(6, -exponent))
```
To understand how it works, I studied the helper in a Python REPL. `5.23` came back as 2.
`5` and `5.0` both came back as 0.

![Python REPL: Decimal(str(5.23)).normalize() returns Decimal('5.23'), and as_tuple() returns sign=0, digits=(5, 2, 3), exponent=-2](/assets/images/decimal-places-5-23.png)

`str(value)` hands the float to `Decimal`.
Then `.normalize()` strips trailing zeros, and `.as_tuple()` breaks what is
left into sign, digits, and exponent. The helper negates the exponent and
clamps the result between 0 and 6. The normalize is why `5` and `5.0` agree.

Then I passed `float('inf')`.

![Python REPL: Decimal(str(float('inf'))).normalize() returns Decimal('Infinity'), as_tuple() returns sign=0, digits=(0,), exponent='F', and max(0, min(6, -exponent)) raises TypeError: bad operand type for unary -: 'str'](/assets/images/decimal-places-infinity.png)

`Decimal('Infinity')` parses fine. The exponent came
back as `'F'`. A string. One line later the helper ran `-exponent` on it, and
Python raised `TypeError: bad operand type for unary -: 'str'`.

So I went back and looked at the guard. The try/except wraps the construction
only. A garbage string dies in there with `InvalidOperation`, and the helper
returns 0. The guard caught the parse and missed the crash.

NaN is stranger. Its exponent is `'n'`, and its digits tuple is empty. It
reaches the return line too.

My fix checks the type at the crash site.

```python
    exponent = decimal_value.as_tuple().exponent
    if not isinstance(exponent, int):
        # NaN / Infinity have no decimal places
        return 0
    return max(0, min(6, -exponent))
```

The helper returns 0, the same answer bad input already gets.
