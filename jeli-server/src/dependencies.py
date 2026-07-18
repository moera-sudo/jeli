# Глобальные FastAPI-зависимости, используемые несколькими фичами одновременно.
# Пример из CLAUDE.md — get_current_user: появится в Этапе 2 вместе с фичей auth
# и будет декодировать access JWT (src.features.auth.service) и подгружать пользователя.
# TODO: добавить get_current_user / get_current_user_id после реализации фичи auth.
