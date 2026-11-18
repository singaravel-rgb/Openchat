from enum import StrEnum


class UserRole(StrEnum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    AGENT = "agent"
    CUSTOMER = "customer"
