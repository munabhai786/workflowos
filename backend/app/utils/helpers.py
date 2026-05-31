def success_response(
    data=None,
    message="Success",
    status=200,
):
    return {
        "data": data,
        "message": message,
        "status": status,
    }