package fr.alykell.aloria.hud.mixin;

import net.minecraft.client.multiplayer.MultiPlayerGameMode;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** Avancement du bloc en cours de minage (0 à 1). */
@Mixin(MultiPlayerGameMode.class)
public interface GameModeAccessor {
	@Accessor("destroyProgress")
	float getDestroyProgress();
}
