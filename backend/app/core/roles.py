from enum import StrEnum


class UserRole(StrEnum):
    CUSTOMER = "customer"
    AGENT = "agent"
    ADMIN = "admin"
