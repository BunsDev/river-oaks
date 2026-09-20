#include "RiverOaksGameMode.h"
#include "RiverStreetPawn.h"
ARiverOaksGameMode::ARiverOaksGameMode()
{
    HUDClass = ARiverStreetHUD::StaticClass();
    DefaultPawnClass = ARiverStreetPawn::StaticClass();
}
