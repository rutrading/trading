import pytest


def pytest_collection_modifyitems(items):
    for item in items:
        if item.get_closest_marker("anyio") is None and asyncio_test(item):
            item.add_marker(pytest.mark.anyio)


def asyncio_test(item) -> bool:
    import inspect

    return inspect.iscoroutinefunction(getattr(item, "function", None))
