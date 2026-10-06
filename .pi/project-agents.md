# Django MVT: Project-Specific Rules

Follow these rules in every Django change. The MVT boundaries below are law.

## 0. MVT Boundaries (Law)

| Layer | Owns | Forbidden |
|---|---|---|
| **Model** | Data integrity, `save()`, `clean()`, Managers | HTML, request handling |
| **Form** | Validation, `clean()`, field logic | DB queries (use Model methods) |
| **View** | Request/response, auth, queryset optimization | Business logic, HTML generation |
| **Template** | Presentation, HTMX attributes | DB queries, business logic |
| **URL** | Routing, `app_name`, named paths | Logic |

## 1. Anti-Patterns

Never do any of the following:

- Never query the DB in templates. Use `select_related`/`prefetch_related` in the View instead.
- Never put business logic in a View. Move it to a Model method or a Form `clean()`.
- Never generate HTML in a View. Pass context to the Template instead.
- Never debug with `print()`. Write a probe script instead.
- Never use `shell -c` one-liners. Write a `.py` probe in `probes/` instead.
- Never use DRF for HTMX endpoints. Use a standard CBV/FBV with `render()` instead.
- Never write custom SQL when the ORM suffices. Use `QuerySet.annotate()` instead.
- Never use signals for business logic. Make explicit method calls instead.

## 2. HTMX Rules

- Return rendered HTML partials from HTMX endpoints, never JSON.
- Name partial templates `myapp/_<model>_<fragment>.html` (underscore prefix).
- Put `hx-swap-oob="true"` on secondary elements for OOB swaps.
- Detect HTMX requests in the View via `request.headers.get("HX-Request")`.

## 3. Probe Script Template

Every Subagent MUST produce probes following this template exactly:

```python
#!/usr/bin/env python
"""Probe: <Feature> - Happy Path v<N>"""
import os, sys, django, json
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from django.test import RequestFactory, Client
from django.contrib.auth import get_user_model
User = get_user_model()

def probe():
    results = {"probe": "...", "status": "pending", "checks": []}
    # Check 1: Model
    try:
        # instance = MyModel.objects.create(...)
        results["checks"].append({"layer": "model", "status": "pass"})
    except Exception as e:
        results["checks"].append({"layer": "model", "status": "fail", "error": str(e)})
    # Check 2: View
    # Check 3: Template
    results["status"] = "pass" if all(c["status"] == "pass" for c in results["checks"]) else "fail"
    return results

if __name__ == "__main__":
    print(json.dumps(probe(), indent=2))
```

## 4. Task Map Template

Before spawning a Subagent, the spec MUST contain a task map in exactly this format:

```markdown
## Task Map: <Feature>

### Models (`myapp/models.py`)
- [ ] `MyModel` — fields, `Meta`, `__str__`, `get_absolute_url`

### Forms (`myapp/forms.py`)
- [ ] `MyModelForm` — `Meta: model = MyModel`, validation

### Views (`myapp/views.py`)
- [ ] `MyView` — CBV, auth, queryset optimization

### Templates (`myapp/templates/myapp/`)
- [ ] `<model>_form.html` — full page
- [ ] `_<model>_item.html` — HTMX partial

### URLs (`myapp/urls.py`)
- [ ] `path("create/", MyView.as_view(), name="myapp_create")`

### Tests & Probes
- [ ] `probes/test_<feature>_v<N>.py` — happy path
- [ ] `probes/test_<feature>_edge_<name>.py` — edge cases
```
