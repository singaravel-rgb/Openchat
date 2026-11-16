from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_roles
from app.db.session import get_db
from app.models.team import Department, Team, user_team_membership
from app.models.user import User
from app.schemas.team import (
    DepartmentCreate,
    DepartmentResponse,
    DepartmentUpdate,
    TeamCreate,
    TeamMemberAdd,
    TeamResponse,
    TeamUpdate,
)

router = APIRouter(prefix="/teams", tags=["Teams & Departments"])


def require_admin_or_agent(current_user: User = Depends(require_roles("agent", "admin"))) -> User:
    return current_user


# ===== Team Endpoints =====

@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
def create_team(
    data: TeamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Create a team."""
    existing = db.query(Team).filter(Team.slug == data.slug).first()
    if existing:
        raise HTTPException(status_code=409, detail="Team slug already exists")

    team = Team(
        name=data.name,
        slug=data.slug,
        description=data.description,
        is_active=data.is_active,
    )
    db.add(team)
    db.commit()
    db.refresh(team)
    team_data = TeamResponse.model_validate(team)
    team_data.member_count = 0
    return team_data


@router.get("", response_model=list[TeamResponse])
def list_teams(
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """List teams."""
    query = db.query(Team)
    if is_active is not None:
        query = query.filter(Team.is_active == is_active)
    teams = query.order_by(Team.name).all()
    result = []
    for team in teams:
        member_count = len(team.members)
        team_data = TeamResponse.model_validate(team)
        team_data.member_count = member_count
        result.append(team_data)
    return result


# ===== Department Endpoints (must come before /{team_id}) =====

@router.post("/departments", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
def create_department(
    data: DepartmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Create a department."""
    existing = db.query(Department).filter(Department.slug == data.slug).first()
    if existing:
        raise HTTPException(status_code=409, detail="Department slug already exists")

    # Validate team_id if provided
    if data.team_id:
        team = db.query(Team).filter(Team.id == data.team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")

    dept = Department(
        name=data.name,
        slug=data.slug,
        description=data.description,
        team_id=data.team_id,
        is_active=data.is_active,
    )
    db.add(dept)
    db.commit()
    db.refresh(dept)

    team_name = None
    if dept.team_id:
        t = db.query(Team).filter(Team.id == dept.team_id).first()
        team_name = t.name if t else None

    dept_data = DepartmentResponse.model_validate(dept)
    dept_data.team_name = team_name
    return dept_data


@router.get("/departments", response_model=list[DepartmentResponse])
def list_departments(
    is_active: Optional[bool] = None,
    team_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """List departments."""
    query = db.query(Department)
    if is_active is not None:
        query = query.filter(Department.is_active == is_active)
    if team_id:
        query = query.filter(Department.team_id == team_id)
    depts = query.order_by(Department.name).all()

    result = []
    for dept in depts:
        team_name = None
        if dept.team_id:
            t = db.query(Team).filter(Team.id == dept.team_id).first()
            team_name = t.name if t else None
        dept_data = DepartmentResponse.model_validate(dept)
        dept_data.team_name = team_name
        result.append(dept_data)
    return result


@router.get("/departments/{dept_id}", response_model=DepartmentResponse)
def get_department(
    dept_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Get a specific department."""
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    team_name = None
    if dept.team_id:
        t = db.query(Team).filter(Team.id == dept.team_id).first()
        team_name = t.name if t else None
    dept_data = DepartmentResponse.model_validate(dept)
    dept_data.team_name = team_name
    return dept_data


@router.patch("/departments/{dept_id}", response_model=DepartmentResponse)
def update_department(
    dept_id: int,
    data: DepartmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Update a department."""
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    if data.team_id:
        team = db.query(Team).filter(Team.id == data.team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(dept, field, value)

    db.commit()
    db.refresh(dept)

    team_name = None
    if dept.team_id:
        t = db.query(Team).filter(Team.id == dept.team_id).first()
        team_name = t.name if t else None
    dept_data = DepartmentResponse.model_validate(dept)
    dept_data.team_name = team_name
    return dept_data


@router.delete("/departments/{dept_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(
    dept_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Delete a department."""
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    db.delete(dept)
    db.commit()
    return None


# ===== Team Detail Endpoints (after /departments) =====

@router.get("/{team_id}", response_model=TeamResponse)
def get_team(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Get a specific team."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    member_count = len(team.members)
    team_data = TeamResponse.model_validate(team)
    team_data.member_count = member_count
    return team_data


@router.patch("/{team_id}", response_model=TeamResponse)
def update_team(
    team_id: int,
    data: TeamUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Update a team."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(team, field, value)

    db.commit()
    db.refresh(team)
    member_count = len(team.members)
    team_data = TeamResponse.model_validate(team)
    team_data.member_count = member_count
    return team_data


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Delete a team."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Remove all department associations
    db.query(Department).filter(Department.team_id == team_id).update({Department.team_id: None})

    db.delete(team)
    db.commit()
    return None


@router.post("/{team_id}/members", status_code=status.HTTP_201_CREATED)
def add_team_member(
    team_id: int,
    data: TeamMemberAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Add a user to a team."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if already a member
    existing = (
        db.query(user_team_membership)
        .filter(
            user_team_membership.c.user_id == data.user_id,
            user_team_membership.c.team_id == team_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="User is already a member of this team")

    db.execute(
        user_team_membership.insert().values(user_id=data.user_id, team_id=team_id)
    )
    db.commit()
    return {"message": "User added to team"}


@router.delete("/{team_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_team_member(
    team_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Remove a user from a team."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    db.execute(
        user_team_membership.delete().where(
            user_team_membership.c.user_id == user_id,
            user_team_membership.c.team_id == team_id,
        )
    )
    db.commit()
    return None