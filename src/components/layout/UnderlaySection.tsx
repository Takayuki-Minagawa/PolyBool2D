import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import {
  deleteUnderlayImage,
  listUnderlayImages,
  notifyUnderlaysChanged,
  UNDERLAYS_CHANGED_EVENT,
  updateUnderlayTransform,
  type UnderlayImage,
  type UnderlayTransform,
} from '../../persistence/underlayStore';

export function UnderlaySection() {
  const { t } = useTranslation();
  const projectId = useAppStore((state) => state.project.id);
  const [images, setImages] = useState<UnderlayImage[]>([]);
  const loadedImagesRef = useRef<UnderlayImage[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await listUnderlayImages(projectId);
        if (
          !cancelled &&
          (next.length > 0 || loadedImagesRef.current.length > 0)
        ) {
          loadedImagesRef.current = next;
          setImages(next);
        }
      } catch {
        if (!cancelled && loadedImagesRef.current.length > 0) {
          loadedImagesRef.current = [];
          setImages([]);
        }
      }
    };
    const onChanged = (event: Event) => {
      const changedProject = (event as CustomEvent<{ projectId?: string }>).detail?.projectId;
      if (!changedProject || changedProject === projectId) void load();
    };
    void load();
    window.addEventListener(UNDERLAYS_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(UNDERLAYS_CHANGED_EVENT, onChanged);
    };
  }, [projectId]);

  async function update(id: string, partial: Partial<UnderlayTransform>) {
    setImages((current) =>
      current.map((image) => image.id === id ? { ...image, ...partial } : image),
    );
    if (await updateUnderlayTransform(id, partial)) {
      notifyUnderlaysChanged(projectId);
    }
  }

  async function remove(id: string) {
    await deleteUnderlayImage(id);
    setImages((current) => current.filter((image) => image.id !== id));
    notifyUnderlaysChanged(projectId);
  }

  return (
    <section>
      <h2>{t('panel.underlays')}</h2>
      {images.length === 0 && (
        <p className="muted-text">{t('panel.noUnderlays')}</p>
      )}
      {images.map((image) => (
        <div className="underlay-editor" key={image.id}>
          <div className="row">
            <strong>{image.name}</strong>
            <button onClick={() => void remove(image.id)}>{t('panel.delete')}</button>
          </div>
          <label className="row">
            <span>{t('panel.visible')}</span>
            <input
              type="checkbox"
              checked={image.visible}
              onChange={(event) => void update(image.id, { visible: event.target.checked })}
            />
          </label>
          <label className="row">
            <span>{t('panel.opacity')}</span>
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={image.opacity}
              onChange={(event) => void update(image.id, { opacity: Number(event.target.value) })}
            />
          </label>
          <div className="underlay-transform-grid">
            {([
              ['x', image.x],
              ['y', image.y],
              ['scale', image.scale],
              ['rotationDeg', image.rotationDeg],
            ] as const).map(([key, value]) => (
              <label key={key}>
                <span>{t(`panel.underlay.${key}`)}</span>
                <input
                  type="number"
                  step="any"
                  min={key === 'scale' ? '0.000001' : undefined}
                  value={value}
                  onChange={(event) =>
                    void update(image.id, { [key]: Number(event.target.value) })
                  }
                />
              </label>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
