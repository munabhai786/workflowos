from app.models.activity import Activity


def create_activity(
    db,
    action_type,
    message,
    user_id=None,
    project_id=None,
    task_id=None,
    entity_type=None,
    entity_id=None,
):

    activity = Activity(

        action=action_type,

        action_type=action_type,

        message=message,

        description=message,

        entity_type=entity_type or action_type,

        entity_id=entity_id or task_id,

        user_id=user_id,

        project_id=project_id,

        task_id=task_id,
    )

    db.add(activity)

    db.commit()

    db.refresh(activity)

    return activity