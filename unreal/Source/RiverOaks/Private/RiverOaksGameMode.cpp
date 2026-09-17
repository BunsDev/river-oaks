#include "RiverOaksGameMode.h"
#include "GameFramework/SpectatorPawn.h"
ARiverOaksGameMode::ARiverOaksGameMode()
{
    DefaultPawnClass = ASpectatorPawn::StaticClass();
}
