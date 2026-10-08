from fastapi import APIRouter
from app.services import evaluation_service

router = APIRouter()

@router.post("/run-system")
def run_system_eval(dataset_id: str):
    # return evaluation_service.run_system_evaluation(dataset_id)
    return {"status": "placeholder"}
