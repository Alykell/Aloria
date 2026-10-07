package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Draw;
import fr.alykell.aloria.hud.Fonts;
import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.config.ModuleSettings;
import fr.alykell.aloria.hud.mixin.GameModeAccessor;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.util.Mth;
import org.jspecify.annotations.Nullable;

import java.util.Locale;

/** Bloc ou créature visé, façon Jade : icône, nom, mod d'origine et une info utile (récolte, minage, vie). */
public final class LookModule extends HudModule {
	/** bar : remplissage de 0 à 1, ou négatif s'il n'y a pas de barre */
	private record Target(@Nullable ItemStack icon, String name, String source, @Nullable String info, int infoColor, float bar) {
	}

	private static final int PAD = 4;
	private static final int ICON = 16;
	private static final int MIN_WIDTH = 100;
	private static final int GREEN = 0xFF7BE495;
	private static final int YELLOW = 0xFFFFD166;
	private static final int RED = 0xFFFF6B6B;

	public LookModule() {
		super("look", "Bloc visé");
	}

	@Override
	public ModuleSettings defaults() {
		return new ModuleSettings(false, 0.5f, 0f);
	}

	@Override
	public boolean centered() {
		return true;
	}

	@Override
	public String hint() {
		return "Visible quand tu regardes un bloc ou une créature";
	}

	@Override
	public boolean hasContent(Minecraft mc) {
		return target(mc, false) != null;
	}

	/** Nom du mod qui ajoute le bloc ou la créature (« Minecraft » pour le jeu de base) */
	private static String modName(String namespace) {
		return FabricLoader.getInstance().getModContainer(namespace).map(c -> c.getMetadata().getName()).orElse(namespace);
	}

	private static @Nullable ItemStack nonEmpty(ItemStack stack) {
		return stack.isEmpty() ? null : stack;
	}

	private static @Nullable Target target(Minecraft mc, boolean preview) {
		Target t = null;
		if (mc.level != null && mc.player != null && mc.hitResult != null) {
			if (mc.hitResult instanceof BlockHitResult hit && mc.hitResult.getType() == HitResult.Type.BLOCK) t = block(mc, hit.getBlockPos());
			else if (mc.hitResult instanceof EntityHitResult hit) t = entity(hit.getEntity());
		}
		if (t == null && preview) {
			// Pas d'objet sans partie chargée (composants non liés) : l'aperçu du menu principal n'a pas d'icône
			ItemStack icon = mc.level != null ? new ItemStack(Items.GRASS_BLOCK) : null;
			t = new Target(icon, "Bloc d'herbe", "Minecraft", "✔ Récoltable", GREEN, -1);
		}
		return t;
	}

	private static @Nullable Target block(Minecraft mc, BlockPos pos) {
		BlockState state = mc.level.getBlockState(pos);
		if (state.isAir()) return null;
		ItemStack icon = nonEmpty(new ItemStack(state.getBlock().asItem()));
		String name = state.getBlock().getName().getString();
		String source = modName(BuiltInRegistries.BLOCK.getKey(state.getBlock()).getNamespace());

		float progress = mc.gameMode != null && mc.gameMode.isDestroying() ? ((GameModeAccessor) mc.gameMode).getDestroyProgress() : 0;
		if (progress > 0) {
			return new Target(icon, name, source, String.format(Locale.ROOT, "Minage %d %%", Math.round(progress * 100)), YELLOW, progress);
		}
		if (state.getDestroySpeed(mc.level, pos) < 0) return new Target(icon, name, source, "Incassable", RED, -1);
		if (state.requiresCorrectToolForDrops()) {
			boolean ok = mc.player.hasCorrectToolForDrops(state);
			return new Target(icon, name, source, ok ? "✔ Récoltable" : "✘ Mauvais outil", ok ? GREEN : RED, -1);
		}
		return new Target(icon, name, source, null, 0, -1);
	}

	private static Target entity(Entity entity) {
		ItemStack icon;
		if (entity instanceof ItemEntity item) icon = item.getItem().copy();
		else if (entity instanceof Player) icon = new ItemStack(Items.PLAYER_HEAD);
		//#if MC >= 260000
		else icon = SpawnEggItem.byId(entity.getType()).map(ItemStack::new).orElse(null);
		//#else
		//$$ else {
		//$$ 	SpawnEggItem egg = SpawnEggItem.byId(entity.getType());
		//$$ 	icon = egg != null ? new ItemStack(egg) : null;
		//$$ }
		//#endif
		String name = entity.getDisplayName().getString();
		String source = modName(BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()).getNamespace());
		if (entity instanceof LivingEntity living) {
			float health = living.getHealth();
			float max = Math.max(1, living.getMaxHealth());
			String info = String.format(Locale.ROOT, "❤ %s / %s", amount(health), amount(max));
			return new Target(icon, name, source, info, RED, Mth.clamp(health / max, 0, 1));
		}
		return new Target(icon, name, source, null, 0, -1);
	}

	/** 20 → « 20 », 7.5 → « 7.5 » */
	private static String amount(float value) {
		float rounded = Math.round(value * 10) / 10f;
		return rounded == Math.floor(rounded) ? String.valueOf((int) rounded) : String.valueOf(rounded);
	}

	private static int textLeft(Target t) {
		return PAD + (t.icon() != null ? ICON + 5 : 0);
	}

	@Override
	public int width(Minecraft mc, ModuleSettings s, boolean preview) {
		Target t = target(mc, preview);
		if (t == null) return MIN_WIDTH;
		int text = Math.max(Fonts.width(mc, s.font, t.name()), Fonts.width(mc, s.font, t.source()));
		if (t.info() != null) text = Math.max(text, Fonts.width(mc, s.font, t.info()));
		return Math.max(MIN_WIDTH, textLeft(t) + text + PAD + 2);
	}

	@Override
	public int height(Minecraft mc, ModuleSettings s, boolean preview) {
		Target t = target(mc, preview);
		int lines = t == null ? 2 : t.info() != null ? 3 : 2;
		int bar = t != null && t.bar() >= 0 ? 5 : 0;
		return Math.max(ICON, lines * 10 - 1 + bar) + PAD * 2;
	}

	@Override
	public void draw(GuiGraphicsExtractor g, Minecraft mc, ModuleSettings s, boolean preview) {
		Target t = target(mc, preview);
		if (t == null) return;
		int w = width(mc, s, preview);
		int h = height(mc, s, preview);
		Draw.panel(g, 0, 0, w, h, s);
		if (t.icon() != null) g.item(t.icon(), PAD, (h - ICON) / 2);

		int x = textLeft(t);
		int y = PAD;
		Fonts.draw(g, mc, s.font, t.name(), x, y, Theme.WHITE, s.shadow);
		y += 10;
		Fonts.draw(g, mc, s.font, t.source(), x, y, Draw.textColor(s), s.shadow);
		y += 10;
		if (t.info() != null) {
			Fonts.draw(g, mc, s.font, t.info(), x, y, t.infoColor(), s.shadow);
			y += 10;
		}
		if (t.bar() >= 0) {
			int barW = w - x - PAD;
			g.fill(x, y + 1, x + barW, y + 3, 0x50FFFFFF);
			g.fill(x, y + 1, x + Math.round(barW * t.bar()), y + 3, t.infoColor());
		}
	}
}
