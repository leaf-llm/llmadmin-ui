import { useTranslation } from 'react-i18next';
import { ModelCategory, VISIBLE_CATEGORIES } from '../types/models';

interface CategoryTabsProps {
  activeCategory: ModelCategory;
  onCategoryChange: (category: ModelCategory) => void;
}

const CATEGORY_KEYS: Record<ModelCategory, string> = {
  text: 'categoryText',
  image: 'categoryImage',
  video: 'categoryVideo',
  audio: 'categoryAudio',
  mcp: 'categoryMcp',
};

export default function CategoryTabs({
  activeCategory,
  onCategoryChange,
}: CategoryTabsProps) {
  const { t } = useTranslation();

  return (
    <div className="category-tabs">
      {VISIBLE_CATEGORIES.map((category) => (
        <button
          key={category}
          className={`category-tab ${activeCategory === category ? 'active' : ''}`}
          onClick={() => onCategoryChange(category)}
        >
          {t(`common.${CATEGORY_KEYS[category]}`)}
        </button>
      ))}
    </div>
  );
}
